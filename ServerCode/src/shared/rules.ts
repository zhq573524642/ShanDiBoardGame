import { Card, RANK_POWER, totalPoints } from './cards';
import { GAME, TEAM_SEAT_PATTERN, TURN } from './constants';
import { FullState, Phase, PublicPlayer, TeamId } from './protocol';
import { seededShuffle } from './rng';

/**
 * 与状态无关的纯规则函数：分队、发牌、先手候选、回合推进、局末计分。
 * 单独成文件便于单元测试，也便于后期调规则时只改这一处。
 */

export function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A';
}

export function teamOf(state: Pick<FullState, 'players'>, playerId: string): TeamId | null {
  return state.players.find((p) => p.id === playerId)?.team ?? null;
}

/** 随机打乱 6 人 → 前 3 人 A 队、后 3 人 B 队 → 按 A/B 交叉排座位 */
export function assignSeats(
  entries: { id: string; nickname: string }[],
  seed: string,
  hostId: string,
): PublicPlayer[] {
  const shuffled = seededShuffle(entries, seed);
  const teamA = shuffled.slice(0, GAME.TEAM_SIZE);
  const teamB = shuffled.slice(GAME.TEAM_SIZE, GAME.TEAM_SIZE * 2);
  const players: PublicPlayer[] = [];
  let ai = 0;
  let bi = 0;
  TEAM_SEAT_PATTERN.forEach((team, seat) => {
    const entry = team === 'A' ? teamA[ai++] : teamB[bi++];
    players.push({
      id: entry.id,
      nickname: entry.nickname,
      seat,
      team,
      online: true,
      handCount: 0,
      isHost: entry.id === hostId,
      finished: false,
    });
  });
  return players;
}

/**
 * 唯一的「出牌顺序」定义：座位号递增 = 顺时针。
 * 发牌、轮转、接风、UI 座位排布全部走这里，改方向只改 TURN.seatDirection。
 */
export function seatOrder(players: PublicPlayer[]): PublicPlayer[] {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  return TURN.seatDirection === 'clockwise' ? ordered : ordered.reverse();
}

function hasCards(state: Pick<FullState, 'hands'>, playerId: string): boolean {
  return (state.hands[playerId]?.length ?? 0) > 0;
}

/**
 * 一次一张轮流发，按出牌顺序（顺时针），6 人 × 36 张正好发完 216 张，**无底牌**。
 *
 * startPlayerId = 本局发牌起点（2026-11-11 第四轮确认）：
 *  - 空串：从座位 0 起（一场游戏的首局）
 *  - 玩家 id：从该玩家起，之后仍按顺时针绕一圈
 * 起点只决定「谁先拿到第一张牌」，与先手玩家、出牌顺序无关。
 */
export function dealCards(
  deck: Card[],
  players: PublicPlayer[],
  startPlayerId = '',
): Record<string, Card[]> {
  const hands: Record<string, Card[]> = {};
  for (const p of players) hands[p.id] = [];
  const cards = [...deck];
  const order = seatOrder(players);
  const idx = startPlayerId ? order.findIndex((p) => p.id === startPlayerId) : -1;
  // 起点玩家排到队首；找不到该玩家时兜底回座位 0
  const start = idx > 0 ? [...order.slice(idx), ...order.slice(0, idx)] : order;
  for (let i = 0; i < GAME.CARDS_PER_PLAYER; i++) {
    for (const p of start) {
      const card = cards.shift();
      if (card) hands[p.id].push(card);
    }
  }
  return hands;
}

/**
 * 非首局发牌起点（2026-11-11 第四轮确认）：
 * 先发给上一局**输家中没有出完牌**的那个人；若有多人未出完，则在他们中随机一人。
 * 随机用本局公开种子做确定性洗牌，保证局末验牌可复算、各端结果一致。
 * remaining 为空时返回空串，兜底从座位 0 起。
 */
export function pickDealStarter(remaining: string[], seed: string): string {
  if (remaining.length === 0) return '';
  if (remaining.length === 1) return remaining[0];
  return seededShuffle(remaining, seed + 'deal')[0];
}

/** 首局：手牌里持有方片3 的玩家 */
export function findDiamond3Holders(hands: Record<string, Card[]>): string[] {
  return Object.entries(hands)
    .filter(([, cards]) => cards.some((c) => c.rank === GAME.FIRST_LEAD_RANK && c.suit === GAME.FIRST_LEAD_SUIT))
    .map(([id]) => id);
}

/** 非首局：上局失败队里仍剩手牌的玩家，随机起点 */
export function buildClaimQueue(remaining: string[], seed: string): string[] {
  return seededShuffle(remaining, seed);
}

/** 下家方向（顺时针）找最近的仍有手牌者；fromPlayerId 可以是已出完牌的人 */
export function nextActivePlayer(
  state: Pick<FullState, 'players' | 'hands'>,
  fromPlayerId: string,
): string {
  const order = seatOrder(state.players);
  const idx = order.findIndex((p) => p.id === fromPlayerId);
  if (idx < 0) return '';
  for (let step = 1; step <= order.length; step++) {
    const p = order[(idx + step) % order.length];
    if (hasCards(state, p.id)) return p.id;
  }
  return '';
}

/** 上家方向（逆时针）找最近的仍有手牌者，跳过已出完牌的人 */
export function previousActivePlayer(
  state: Pick<FullState, 'players' | 'hands'>,
  fromPlayerId: string,
): string {
  const order = seatOrder(state.players);
  const idx = order.findIndex((p) => p.id === fromPlayerId);
  if (idx < 0) return '';
  for (let step = 1; step <= order.length; step++) {
    const p = order[(idx - step + order.length) % order.length];
    if (hasCards(state, p.id)) return p.id;
  }
  return '';
}

/**
 * 「接风」：最后一手牌的玩家已出完牌、其余人全 pass 时，由谁领出新回合。
 * 已确认：A 的上家 B；B 也完牌则继续往上家方向回退，直到找到有手牌者。
 */
export function pickWindfallLeader(
  state: Pick<FullState, 'players' | 'hands'>,
  finishedPlayerId: string,
): string {
  if (TURN.leadAfterFinished === 'lowerSeat') return nextActivePlayer(state, finishedPlayerId);
  if (TURN.leadAfterFinished === 'teammate') {
    const team = teamOf(state, finishedPlayerId);
    const order = seatOrder(state.players);
    const idx = order.findIndex((p) => p.id === finishedPlayerId);
    for (let step = 1; step <= order.length; step++) {
      const p = order[(idx + step) % order.length];
      if (p.team === team && hasCards(state, p.id)) return p.id;
    }
  }
  return previousActivePlayer(state, finishedPlayerId);
}

/**
 * 本回合是否结束：**当前压制轮内**，除最后一手牌的玩家外所有仍可出牌的人都 pass 了。
 * 有人压过时 engine.play 会清空 passedPlayerIds，开启新一轮，此处判定自动只针对新一轮。
 */
export function isTrickOver(state: Pick<FullState, 'players' | 'hands' | 'lastPlayerId' | 'passedPlayerIds'>): boolean {
  if (!state.lastPlayerId) return false;
  const active = state.players
    .filter((p) => (state.hands[p.id]?.length ?? 0) > 0)
    .map((p) => p.id);
  return active.every((id) => id === state.lastPlayerId || state.passedPlayerIds.includes(id));
}

export interface RoundResult {
  winnerTeam: TeamId;
  captured: Record<TeamId, number>;
  discarded: number;
  tribute: number;
  delta: Record<TeamId, number>;
  /** 校验：收走的分 + 作废的分 应等于 400 */
  valid: boolean;
}

/**
 * 局末把尚未结算的牌池判给「最后一手牌」玩家的队（已确认）。
 * 某队第 3 人出完牌时本局立即结束，此时最后一回合往往还没打完；
 * 不清算会让这些分凭空消失，破坏 400 分守恒。
 */
export function settleRemainingPot(state: FullState): { team: TeamId | null; points: number } {
  if (state.pot.length === 0) return { team: null, points: 0 };
  const points = totalPoints(state.pot);
  const team = teamOf(state, state.lastPlayerId);
  if (team) state.teams[team].captured += points;
  state.pot = [];
  state.currentPlay = null;
  state.passedPlayerIds = [];
  state.trickCycle = 0;
  return { team, points };
}

/**
 * 局末结算（2026-11-11 数字复核确认）：
 *  - 各队本局收的分 = 自己赢下的回合牌池分之和
 *  - 全局上游属于获胜队时，失败队额外转 100 分给获胜队（允许负分）
 *  - 局末留在手里的分作废；captured.A + captured.B + discarded 应等于 400
 *
 * 用户给出的标准算例：赢家 200 / 输家 170 / 废弃 30：
 *   上游属获胜队 → 300 / 70；上游不属获胜队 → 200 / 170。
 * 「400 − 废弃分」是两队得分之和的校验式，不是输家单独再记一笔分。
 */
export function calcRoundResult(state: FullState, winnerTeam: TeamId): RoundResult {
  const discarded = Object.values(state.hands).reduce((sum, hand) => sum + totalPoints(hand), 0);
  const captured: Record<TeamId, number> = {
    A: state.teams.A.captured,
    B: state.teams.B.captured,
  };
  const upstreamTeam = state.upstreamPlayerId ? teamOf(state, state.upstreamPlayerId) : null;
  const tribute = upstreamTeam === winnerTeam ? GAME.TRIBUTE_POINTS : 0;
  const delta: Record<TeamId, number> = {
    A: captured.A + (winnerTeam === 'A' ? tribute : -tribute),
    B: captured.B + (winnerTeam === 'B' ? tribute : -tribute),
  };
  const valid = captured.A + captured.B + discarded === GAME.TOTAL_POINTS_PER_ROUND;
  return { winnerTeam, captured, discarded, tribute, delta, valid };
}

export function isMatchOver(state: FullState): boolean {
  return state.teams.A.matchScore >= GAME.MATCH_TARGET_SCORE
    || state.teams.B.matchScore >= GAME.MATCH_TARGET_SCORE;
}

export function canStart(phase: Phase, playerCount: number): { ok: boolean; error?: string } {
  if (phase !== 'lobby') return { ok: false, error: '牌局已开始' };
  if (playerCount !== GAME.PLAYER_COUNT) {
    return { ok: false, error: `需要 ${GAME.PLAYER_COUNT} 人，还差 ${GAME.PLAYER_COUNT - playerCount} 人` };
  }
  return { ok: true };
}

/** 供 UI 排序手牌时使用：大到小 */
export function compareCardDesc(a: Card, b: Card): number {
  return RANK_POWER[b.rank] - RANK_POWER[a.rank];
}
