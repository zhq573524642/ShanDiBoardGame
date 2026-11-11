import { Card } from './cards';
import { NET, UI } from './constants';

/** 客户端 / 服务端 / 近场房主共用，不得依赖 Cocos、Node 或 DOM */
export type NetMode = 'lan' | 'cloud' | 'auto';
export type TeamId = 'A' | 'B';

export interface AppConfig {
  mode: NetMode;
  cloudUrl: string;
  lanUdpPort: number;
  lanTcpPort: number;
  lanDiscoverTimeoutMs: number;
  roomId: string;
  playerId: string;
  nickname: string;
  handLayout: 'fan' | 'flat' | 'paged';
}

export const DEFAULT_CONFIG: AppConfig = {
  mode: 'auto',
  cloudUrl: NET.DEFAULT_CLOUD_URL,
  lanUdpPort: NET.LAN_UDP_PORT,
  lanTcpPort: NET.LAN_TCP_PORT,
  lanDiscoverTimeoutMs: NET.LAN_DISCOVER_TIMEOUT_MS,
  roomId: 'shandi-001',
  playerId: '',
  nickname: '玩家',
  handLayout: UI.handLayout,
};

export type Phase = 'lobby' | 'commit' | 'reveal' | 'claimFirst' | 'playing' | 'roundSettle' | 'matchEnd';
export type FirstLeadMode = 'diamond3' | 'askLoser';

export interface PublicPlayer {
  id: string;
  nickname: string;
  seat: number;
  team: TeamId;
  online: boolean;
  handCount: number;
  isHost: boolean;
  /** 是否已出完牌 */
  finished: boolean;
}

export interface PlayedCards {
  playerId: string;
  cards: Card[];
  comboType: string;
  comboLabel: string;
}

export interface TeamScore {
  /** 本局各回合累计收的分 */
  captured: number;
  /** 跨局累计总分 */
  matchScore: number;
}

/** 权威端完整状态：含所有人手牌，绝不整体下发 */
export interface FullState {
  matchId: string;
  roomId: string;
  phase: Phase;
  seq: number;
  roundNo: number;
  hostId: string;
  players: PublicPlayer[];
  hands: Record<string, Card[]>;
  teams: Record<TeamId, TeamScore>;
  /** 本回合牌池：双方打出的全部牌 */
  pot: Card[];
  currentPlay: PlayedCards | null;
  lastPlayerId: string;
  turnPlayerId: string;
  passedPlayerIds: string[];
  claimQueue: string[];
  claimIndex: number;
  firstLeadMode: FirstLeadMode;
  /** 上一局失败队中、局末手里还有牌的玩家；用于非首局「询问是否先出」 */
  prevRoundRemaining: string[];
  /** 出完牌的先后顺序，[0] 即全局上游 */
  finishedOrder: string[];
  upstreamPlayerId: string;
  winnerTeam: TeamId | null;
  lastRoundResult: {
    winnerTeam: TeamId;
    captured: Record<TeamId, number>;
    discarded: number;
    tribute: number;
    delta: Record<TeamId, number>;
    /** 分数守恒校验：两队已收分 + 废弃分 === 400 */
    valid: boolean;
  } | null;
  commitments: Record<string, string>;
  seeds: Record<string, string>;
  combinedSeed: string;
  proof: { seed: string; commitment: string } | null;
  shuffledDeck: Card[];
  lastEvents: string[];
}

/** 逐人脱敏视图：只包含自己的手牌 */
export interface ViewState {
  matchId: string;
  roomId: string;
  phase: Phase;
  seq: number;
  roundNo: number;
  hostId: string;
  selfPlayerId: string;
  players: PublicPlayer[];
  selfHand: Card[];
  teams: Record<TeamId, TeamScore>;
  pot: Card[];
  currentPlay: PlayedCards | null;
  lastPlayerId: string;
  turnPlayerId: string;
  passedPlayerIds: string[];
  claimPlayerId: string;
  firstLeadMode: FirstLeadMode;
  upstreamPlayerId: string;
  winnerTeam: TeamId | null;
  lastRoundResult: FullState['lastRoundResult'];
  commitments: Record<string, string>;
  proof: { seed: string; commitment: string } | null;
  lastEvents: string[];
}

export type ClientMsg =
  | { t: 'join'; playerId: string; nickname: string; roomId: string; token?: string }
  | { t: 'resume'; token: string }
  | { t: 'start' }
  | { t: 'nextRound' }
  | { t: 'commit'; commitment: string }
  | { t: 'reveal'; seed: string }
  | { t: 'claimFirst' }
  | { t: 'declineFirst' }
  | { t: 'play'; seq: number; cardIds: string[] }
  | { t: 'pass'; seq: number }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; playerId: string; hostId: string; token: string; state: ViewState }
  | { t: 'state'; state: ViewState }
  | { t: 'event'; events: string[]; seq: number }
  | { t: 'proof'; seed: string; commitment: string }
  | { t: 'error'; code: string; message: string }
  | { t: 'pong' };

export function encode(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg);
}

export function decode<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
