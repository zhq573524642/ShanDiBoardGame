"use strict";
/**
 * 全部规则常量与可配置项集中在这里。
 * 后期调规则（超时时长、目标分、AI 托管、手牌布局…）只改本文件，
 * 不要在引擎或 UI 里散落魔法数字。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSUMPTIONS = exports.UI = exports.FEATURES = exports.NET = exports.TURN = exports.TEAM_SEAT_PATTERN = exports.GAME = void 0;
exports.GAME = {
    DECK_COUNT: 4,
    PLAYER_COUNT: 6,
    TEAM_SIZE: 3,
    CARDS_PER_PLAYER: 36,
    /** 4 副牌里 5/10/K 的总分，用于局末校验牌池是否算漏 */
    TOTAL_POINTS_PER_ROUND: 400,
    MATCH_TARGET_SCORE: 1000,
    TURN_TIMEOUT_MS: 30_000,
    /** 全局上游属于获胜队时，失败队转给获胜队的分数 */
    TRIBUTE_POINTS: 100,
    POINT_RANKS: { '5': 5, '10': 10, K: 10 },
    FIRST_LEAD_RANK: '3',
    FIRST_LEAD_SUIT: 'D',
};
/** 座位随机交叉分队：确保相邻座位尽量不同队，实际座位在开局时随机打乱 */
exports.TEAM_SEAT_PATTERN = ['A', 'B', 'A', 'B', 'A', 'B'];
/**
 * 回合推进规则（2026-11-11 补充确认）。
 * 座位号递增 = 顺时针，发牌与出牌都按这个方向；牌桌 UI 也按此排座位。
 */
exports.TURN = {
    /** 顺时针 / 逆时针，只在确实要改方向时动；UI 与引擎共用 */
    seatDirection: 'clockwise',
    /** 出完牌者赢下回合时，由谁接风领出：上家 / 下家 / 队友 */
    leadAfterFinished: 'upperSeat',
    /** 本局结束时，未结算的牌池先判给最后一手牌玩家的队 */
    settlePotOnRoundEnd: true,
};
// 另两条已确认的回合语义，直接体现在引擎实现里（不做成开关，避免死配置）：
//  1. 任一有牌下家出牌压住即按顺时针正常继续，只有全 pass 才触发接风（engine.advanceTurn）
//  2. 接风者开启全新回合、可出任意牌型（engine.settleTrick 清空 currentPlay / passedPlayerIds）
exports.NET = {
    DEFAULT_CLOUD_URL: 'ws://192.168.1.10:8080/ws',
    LAN_UDP_PORT: 45678,
    LAN_TCP_PORT: 45679,
    LAN_DISCOVER_TIMEOUT_MS: 2500,
    HEARTBEAT_MS: 15_000,
};
/** 产品开关：家庭娱乐默认全关外部依赖，需要时逐项打开 */
exports.FEATURES = {
    aiTrusteeOnDisconnect: true,
    replay: true,
    leaderboard: true,
    fairShuffleProof: true,
    sound: false,
};
/** UI 可自主配置项（规则表第 7 节要求做成可配置） */
exports.UI = {
    /** 'fan' 扇形展开 | 'flat' 平铺多行 | 'paged' 分页 */
    handLayout: 'flat',
    handCardWidth: 62,
    handCardHeight: 88,
    handOverlapRatio: 0.42,
    handRows: 2,
    draggableHand: true,
    tableColor: '#1B6B4A',
    teamAColor: '#E8834A',
    teamBColor: '#4A8FE8',
    designWidth: 1280,
    designHeight: 720,
};
/**
 * 规则里未明确、当前采用的默认假设。
 * 每条都对应《规则确认结论.md》里的一个待复核项，确认后改这里即可。
 */
exports.ASSUMPTIONS = {
    /** 假五十K 之间「大小如何比较：无」→ 同级不可互压，先出者保持 */
    fakeFiftyKSameLevelBeats: false,
    /** 同张数顺子 / 连对才能互压（规则表明确要求张数相同） */
    requireSameLengthForSequence: true,
    /** 一张牌池的分数含回合胜者自己打出的分牌（已确认） */
    includeWinnerOwnCardsInPot: true,
    /** 每局结算后判定是否达到 1000 分，不在回合中途结束本场 */
    matchEndCheck: 'afterRound',
    /** 纯王 3 张为特例：只压到同点 3 张；N>=4 张王压到同点 N+2 张 */
    joker3BeatsSame3Only: true,
    /** 出完牌的玩家跳过回合，不参与 pass 计数；若他赢下回合则触发「接风」（见 TURN） */
    skipFinishedPlayers: true,
    /** 队伍座位每场随机打乱一次，局间保持不变 */
    reshuffleSeatsEveryMatch: true,
};
