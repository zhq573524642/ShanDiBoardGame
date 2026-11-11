import assert from 'node:assert/strict';
import { Card, Rank, Suit, POINT_VALUE, makeDeck, totalPoints } from './shared/cards';
import { parseCombo, canBeat, ComboType, LEVEL } from './shared/combo';
import { GameEngine } from './shared/engine';
import { calcRoundResult, seatOrder, previousActivePlayer, pickWindfallLeader } from './shared/rules';
import { GAME } from './shared/constants';
import { hashString, randomSeed, seededShuffle } from './shared/rng';

/** npm run smoke：不依赖网络与数据库的规则引擎全链路自测 */

function mk(rank: Rank, suit: Suit = 'D', d = 0): Card {
  return {
    id: `${rank}${suit}-${d}`, rank, suit, deckIndex: d,
    points: POINT_VALUE[rank] ?? 0,
  };
}
const ok = (cards: Card[]) => {
  const c = parseCombo(cards);
  assert.ok(c, '应能识别牌型: ' + cards.map((x) => x.id).join(','));
  return c;
};

// --- 牌堆 ---
const deck = makeDeck(GAME.DECK_COUNT);
assert.equal(deck.length, 216);
assert.equal(new Set(deck.map((c) => c.id)).size, 216, '4 副牌必须用 deckIndex 去重');
assert.equal(totalPoints(deck), 400, '4 副牌 5/10/K 合计 400 分');
assert.deepEqual(seededShuffle(deck, 'seed'), seededShuffle(deck, 'seed'));
assert.notDeepEqual(seededShuffle(deck, 'a'), seededShuffle(deck, 'b'));

// --- 牌型识别 ---
assert.equal(ok([mk('3', 'D')]).type, ComboType.SINGLE);
assert.equal(ok([mk('3', 'D'), mk('3', 'D', 1)]).type, ComboType.PAIR);
assert.equal(ok([mk('A'), mk('2'), mk('3'), mk('4'), mk('5')]).type, ComboType.STRAIGHT);
assert.equal(ok([mk('9'), mk('10'), mk('J'), mk('Q'), mk('K')]).type, ComboType.STRAIGHT);
assert.equal(parseCombo([mk('10'), mk('J'), mk('Q'), mk('K'), mk('A')]), null, '10JQKA 不合法');
assert.equal(ok([mk('A'), mk('A', 'C'), mk('2'), mk('2', 'C')]).key, 999, 'AA+22 特例最大');
assert.equal(ok([mk('2'), mk('2', 'C'), mk('3'), mk('3', 'C')]).type, ComboType.CONSEC_PAIRS);
assert.equal(parseCombo([mk('K'), mk('K', 'C'), mk('A'), mk('A', 'C')]), null, 'KK+AA 不合法');
assert.equal(ok([mk('3'), mk('3', 'C'), mk('3', 'S')]).level, LEVEL.sameN(3));
assert.equal(ok([mk('5'), mk('10', 'C'), mk('K')]).type, ComboType.FAKE_50K);
assert.equal(ok([mk('5'), mk('10'), mk('K')]).type, ComboType.TRUE_50K);
assert.equal(ok([mk('sJ', 'J'), mk('bJ', 'J'), mk('sJ', 'J', 1)]).level, LEVEL.JOKER_3);
assert.equal(ok([mk('sJ', 'J'), mk('bJ', 'J'), mk('sJ', 'J', 1), mk('bJ', 'J', 1)]).level, LEVEL.jokerBomb(4));

// --- 压制等级链 ---
const single3 = ok([mk('3', 'D')]);
const single3H = ok([mk('3', 'H')]);
const pair3 = ok([mk('3'), mk('3', 'C')]);
const straightMin = ok([mk('A'), mk('2'), mk('3'), mk('4'), mk('5')]);
const straightMax = ok([mk('9'), mk('10'), mk('J'), mk('Q'), mk('K')]);
const triple3 = ok([mk('3'), mk('3', 'C'), mk('3', 'S')]);
const quad3 = ok([mk('3'), mk('3', 'C'), mk('3', 'S'), mk('3', 'H')]);
const quint5 = ok([mk('5'), mk('5', 'C'), mk('5', 'S'), mk('5', 'H'), mk('5', 'D', 1)]);
const fake50k = ok([mk('5'), mk('10', 'C'), mk('K')]);
const true50k = ok([mk('5'), mk('10'), mk('K')]);
const six3 = ok(Array.from({ length: 6 }, (_, i) => mk('3', (['D', 'C', 'S', 'H'] as Suit[])[i % 4], i)));
const joker3 = ok([mk('sJ', 'J'), mk('bJ', 'J'), mk('sJ', 'J', 1)]);
const joker4 = ok([mk('sJ', 'J'), mk('bJ', 'J'), mk('sJ', 'J', 1), mk('bJ', 'J', 1)]);

assert.equal(canBeat(single3H, single3), true, '同点数单张比花色');
assert.equal(canBeat(single3, single3H), false);
assert.equal(canBeat(straightMin, pair3), false, '顺子不能压对子');
assert.equal(canBeat(triple3, straightMin), true, '三张可压任意顺子');
assert.equal(canBeat(straightMax, straightMin), true, '同张数顺子比首牌');
assert.equal(canBeat(quad3, triple3), true, '四张压三张');
assert.equal(canBeat(fake50k, quint5), true, '假五十K 压五张');
assert.equal(canBeat(true50k, fake50k), true, '真五十K 压假五十K');
assert.equal(canBeat(six3, true50k), true, '六张压真五十K');
assert.equal(canBeat(joker4, six3), true, '4 张王压六张');
assert.equal(canBeat(joker3, triple3), true, '3 张王压三张');
assert.equal(canBeat(joker3, quad3), false, '3 张王不能压四张');
assert.equal(
  canBeat(ok([mk('A'), mk('A', 'C'), mk('2'), mk('2', 'C')]), ok([mk('Q'), mk('Q', 'C'), mk('K'), mk('K', 'C')])),
  true,
  'AA+22 特例压过同张数其他连对',
);

// --- 局末结算（已确认口径）---
const e0 = new GameEngine('calc', 'p1');
e0.state.teams.A.captured = 340;
e0.state.teams.B.captured = 0;
e0.state.hands = { p1: Array.from({ length: 12 }, (_, i) => mk('5', 'D', i)), p2: [] };
e0.state.players = [
  { id: 'p1', nickname: 'p1', seat: 0, team: 'A', online: true, handCount: 1, isHost: true, finished: false },
  { id: 'p2', nickname: 'p2', seat: 1, team: 'B', online: true, handCount: 0, isHost: false, finished: true },
];
e0.state.upstreamPlayerId = 'p2';
const noTribute = calcRoundResult(e0.state, 'A');
assert.equal(noTribute.delta.A, 340, '上游不属获胜队：赢家 340');
assert.equal(noTribute.delta.B, 0, '上游不属获胜队：输家 0');
assert.equal(noTribute.valid, true, '已收 340 + 作废 60 = 400');
e0.state.upstreamPlayerId = 'p1';
const withTribute = calcRoundResult(e0.state, 'A');
assert.equal(withTribute.delta.A, 440, '上游属获胜队：赢家 440');
assert.equal(withTribute.delta.B, -100, '上游属获胜队：输家 -100');

// --- 补充确认 1：计分算例「赢家 200 / 输家 170 / 废弃 30」---
const eScore = new GameEngine('score', 'p1');
eScore.state.teams.A.captured = 200;
eScore.state.teams.B.captured = 170;
eScore.state.hands = {
  p1: [mk('5', 'D', 0), mk('5', 'D', 1), mk('5', 'D', 2), mk('5', 'D', 3), mk('10', 'D', 0)],
  p2: [],
};
eScore.state.players = [
  { id: 'p1', nickname: 'p1', seat: 0, team: 'A', online: true, handCount: 5, isHost: true, finished: false },
  { id: 'p2', nickname: 'p2', seat: 1, team: 'B', online: true, handCount: 0, isHost: false, finished: true },
];
eScore.state.upstreamPlayerId = 'p1'; // 情况1：全局上游属于获胜队
const case1 = calcRoundResult(eScore.state, 'A');
assert.equal(case1.delta.A, 300, '情况1：赢家 300');
assert.equal(case1.delta.B, 70, '情况1：输家 70');
assert.equal(case1.valid, true, '200 + 170 + 废弃 30 = 400');
eScore.state.upstreamPlayerId = 'p2'; // 情况2：上游不属于获胜队
const case2 = calcRoundResult(eScore.state, 'A');
assert.equal(case2.delta.A, 200, '情况2：赢家 200');
assert.equal(case2.delta.B, 170, '情况2：输家 170');

// --- 补充确认 2：顺时针 + 出完牌接风 ---
function windfallEngine(alsoFinishUpper: boolean): GameEngine {
  const g = new GameEngine('windfall', 'p1');
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  g.state.players = ids.map((id, i) => ({
    id, nickname: id, seat: i,
    team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
    online: true, handCount: 1, isHost: i === 0,
    finished: alsoFinishUpper && i === 1,
  }));
  g.state.hands = {
    p1: [mk('9', 'D', 0)],
    p2: alsoFinishUpper ? [] : [mk('9', 'D', 1)],
    p3: [mk('9', 'D', 2)], // 出完牌者 A：seat2
    p4: [mk('9', 'D', 3)],
    p5: [mk('9', 'D', 4)],
    p6: [mk('9', 'D', 5)],
  };
  g.state.phase = 'playing';
  g.state.turnPlayerId = 'p3';
  g.state.lastPlayerId = 'p3';
  g.state.currentPlay = null;
  g.state.passedPlayerIds = [];
  g.state.pot = [];
  return g;
}

assert.equal(
  seatOrder(windfallEngine(false).state.players).map((p) => p.id).join(','),
  'p1,p2,p3,p4,p5,p6',
  '座位号递增 = 顺时针',
);

// 场景 A：p3 出完牌，所有下家全 pass → 上家 p2 接风
const w1 = windfallEngine(false);
assert.equal(w1.play('p3', [w1.state.hands.p3[0].id], w1.state.seq).ok, true, 'p3 打出最后一张牌');
assert.equal(w1.state.players.find((p) => p.id === 'p3')?.finished, true, 'p3 标记为已出完');
assert.equal(w1.state.turnPlayerId, 'p4', '顺时针：p3 的下家是 seat3');
let guardW = 0;
while (w1.state.currentPlay && guardW++ < 12) {
  assert.equal(w1.pass(w1.state.turnPlayerId, w1.state.seq).ok, true, '下家应可 pass');
}
assert.equal(w1.state.currentPlay, null, '全 pass 后本回合结算并开启新回合');
assert.equal(w1.state.turnPlayerId, 'p2', '接风者 = p3 的上家 seat1');
assert.equal(w1.state.lastPlayerId, 'p2', '接风者成为新回合首出者');
assert.equal(w1.play('p2', [w1.state.hands.p2[0].id], w1.state.seq).ok, true, '接风者可出任意牌型');

// 场景 B：接风者 p2 也已完牌 → 继续往上家方向回退到 p1
const w2 = windfallEngine(true);
assert.equal(pickWindfallLeader(w2.state, 'p3'), 'p1', '上家链跳过已完牌者');
assert.equal(previousActivePlayer(w2.state, 'p3'), 'p1', '逆时针最近有牌者');
assert.equal(w2.play('p3', [w2.state.hands.p3[0].id], w2.state.seq).ok, true);
guardW = 0;
while (w2.state.currentPlay && guardW++ < 12) {
  assert.equal(w2.pass(w2.state.turnPlayerId, w2.state.seq).ok, true);
}
assert.equal(w2.state.turnPlayerId, 'p1', '上家也完牌时接风链回退到 seat0');

// 场景 C：有下家压住 → 按顺时针正常继续，不触发接风
const w3 = windfallEngine(false);
w3.state.hands.p5 = [mk('10', 'D', 4)];
assert.equal(w3.play('p3', [w3.state.hands.p3[0].id], w3.state.seq).ok, true);
assert.equal(w3.pass('p4', w3.state.seq).ok, true);
assert.equal(w3.state.turnPlayerId, 'p5');
assert.equal(w3.play('p5', [w3.state.hands.p5[0].id], w3.state.seq).ok, true, '下家可压住最后一手');
assert.equal(w3.state.currentPlay?.playerId, 'p5');
assert.equal(w3.state.turnPlayerId, 'p6', '有人压住则正常轮转，不接风');

// --- 补充确认 3：本局结束时未打完的牌池先清算，保证 400 分守恒 ---
const e4 = new GameEngine('lastpot', 'p1');
const ids4 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
e4.state.players = ids4.map((id, i) => ({
  id, nickname: id, seat: i,
  team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
  online: true, handCount: 1, isHost: i === 0,
  finished: i === 0 || i === 4, // A 队另两人已出完
}));
e4.state.hands = {
  p1: [], p3: [mk('5', 'D', 0)], p5: [],
  p2: [mk('5', 'D', 1), mk('5', 'D', 2), mk('5', 'D', 3), mk('10', 'D', 0)],
  p4: [mk('5', 'D', 4)],
  p6: [mk('9', 'D', 5)],
};
e4.state.teams.A.captured = 200;
e4.state.teams.B.captured = 155;
e4.state.pot = [mk('10', 'D', 1)];
e4.state.phase = 'playing';
e4.state.turnPlayerId = 'p3';
e4.state.lastPlayerId = '';
e4.state.currentPlay = null;
e4.state.upstreamPlayerId = 'p2';
assert.equal(e4.play('p3', [e4.state.hands.p3[0].id], e4.state.seq).ok, true, 'A 队第 3 人出完牌');
assert.equal(e4.state.phase, 'roundSettle', '本局立即结束');
assert.equal(e4.state.pot.length, 0, '末回合牌池已清算');
assert.equal(e4.state.lastRoundResult?.captured.A, 215, '末回合 15 分归最后一手牌的 A 队');
assert.equal(e4.state.lastRoundResult?.discarded, 30, '输家手牌 30 分作废');
assert.equal(e4.state.lastRoundResult?.valid, true, '215 + 155 + 30 = 400 守恒');

// --- 引擎全链路 ---
const e = new GameEngine('smoke', 'p1');
for (let i = 1; i <= 6; i++) assert.equal(e.addPlayer(`p${i}`, `玩家${i}`), true);
assert.equal(e.addPlayer('p7', '多余人'), false, '最多 6 人');
assert.equal(e.start().ok, true);
assert.equal(e.state.phase, 'commit');

const seeds: Record<string, string> = {};
for (let i = 1; i <= 6; i++) {
  seeds[`p${i}`] = randomSeed();
  assert.equal(e.commit(`p${i}`, hashString(seeds[`p${i}`])), true);
}
assert.equal(e.state.phase, 'reveal');
assert.equal(e.reveal('p1', 'forged').ok, false, '伪造种子必须被拒');
for (let i = 1; i <= 6; i++) assert.equal(e.reveal(`p${i}`, seeds[`p${i}`]).ok, true);
assert.equal(e.state.phase, 'claimFirst', '洗完牌进入确定先手');
assert.equal(e.state.roundNo, 1);
assert.equal(e.state.players.filter((p) => p.team === 'A').length, 3);
assert.equal(e.state.players.filter((p) => p.team === 'B').length, 3);
for (let i = 0; i < 6; i++) assert.notEqual(e.state.players[i].team, e.state.players[i + 1]?.team, '座位交叉');
assert.equal(Object.values(e.state.hands).reduce((n, h) => n + h.length, 0), 216);
for (const p of e.state.players) assert.equal(e.state.hands[p.id].length, 36);

const view = e.viewFor('p1');
assert.equal(view.selfHand.length, 36);
assert.equal((view as unknown as Record<string, unknown>).hands, undefined, '视图不得含所有手牌');
assert.equal((view as unknown as Record<string, unknown>).shuffledDeck, undefined, '视图不得含整副牌');
assert.equal(e.verifyProof(), true, '局末可复算整副牌');

assert.equal(e.forceFirstLead().ok, true, '首局方片3 兜底');
assert.equal(e.state.phase, 'playing');

// 模拟对局：持续出牌 / pass，每步校验 400 分守恒
let guard = 0;
while (e.state.phase === 'playing' && guard++ < 1500) {
  const pid = e.state.turnPlayerId;
  const hand = e.state.hands[pid];
  if (!hand || hand.length === 0) break;
  let r = e.play(pid, [hand[0].id], e.state.seq);
  if (!r.ok) r = e.pass(pid, e.state.seq);
  if (!r.ok) break;
  const inHands = Object.values(e.state.hands).reduce((n, h) => n + totalPoints(h), 0);
  const inPot = totalPoints(e.state.pot);
  assert.equal(
    e.state.teams.A.captured + e.state.teams.B.captured + inHands + inPot,
    400,
    '任意时刻分数守恒（已收 + 手牌 + 牌池 = 400）',
  );
}
assert.ok(guard > 20, '对局应能推进');
assert.equal(e.verifyProof(), true);

const restored = new GameEngine('smoke', 'p1');
restored.restore(e.snapshot());
assert.equal(restored.state.seq, e.state.seq);
assert.equal(restored.verifyProof(), true);

console.log('[smoke] OK: 216 张牌 / 400 分 / 牌型识别 / 等级链 / AA22 特例 / 200-170-30 计分 / 顺时针 / 出完牌接风 / 末回合牌池清算 / 脱敏 / 分数守恒 / 快照 / 验牌');
