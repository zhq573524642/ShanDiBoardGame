"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.otherTeam = otherTeam;
exports.teamOf = teamOf;
exports.assignSeats = assignSeats;
exports.seatOrder = seatOrder;
exports.dealCards = dealCards;
exports.findDiamond3Holders = findDiamond3Holders;
exports.buildClaimQueue = buildClaimQueue;
exports.nextActivePlayer = nextActivePlayer;
exports.previousActivePlayer = previousActivePlayer;
exports.pickWindfallLeader = pickWindfallLeader;
exports.isTrickOver = isTrickOver;
exports.settleRemainingPot = settleRemainingPot;
exports.calcRoundResult = calcRoundResult;
exports.isMatchOver = isMatchOver;
exports.canStart = canStart;
exports.compareCardDesc = compareCardDesc;
const cards_1 = require("./cards");
const constants_1 = require("./constants");
const rng_1 = require("./rng");
/**
 * 与状态无关的纯规则函数：分队、发牌、先手候选、回合推进、局末计分。
 * 单独成文件便于单元测试，也便于后期调规则时只改这一处。
 */
function otherTeam(team) {
    return team === 'A' ? 'B' : 'A';
}
function teamOf(state, playerId) {
    return state.players.find((p) => p.id === playerId)?.team ?? null;
}
/** 随机打乱 6 人 → 前 3 人 A 队、后 3 人 B 队 → 按 A/B 交叉排座位 */
function assignSeats(entries, seed, hostId) {
    const shuffled = (0, rng_1.seededShuffle)(entries, seed);
    const teamA = shuffled.slice(0, constants_1.GAME.TEAM_SIZE);
    const teamB = shuffled.slice(constants_1.GAME.TEAM_SIZE, constants_1.GAME.TEAM_SIZE * 2);
    const players = [];
    let ai = 0;
    let bi = 0;
    constants_1.TEAM_SEAT_PATTERN.forEach((team, seat) => {
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
function seatOrder(players) {
    const ordered = [...players].sort((a, b) => a.seat - b.seat);
    return constants_1.TURN.seatDirection === 'clockwise' ? ordered : ordered.reverse();
}
function hasCards(state, playerId) {
    return (state.hands[playerId]?.length ?? 0) > 0;
}
/** 一次一张轮流发，按出牌顺序（顺时针），6 人 × 36 张正好发完 216 张 */
function dealCards(deck, players) {
    const hands = {};
    for (const p of players)
        hands[p.id] = [];
    const cards = [...deck];
    const order = seatOrder(players);
    for (let i = 0; i < constants_1.GAME.CARDS_PER_PLAYER; i++) {
        for (const p of order) {
            const card = cards.shift();
            if (card)
                hands[p.id].push(card);
        }
    }
    return hands;
}
/** 首局：手牌里持有方片3 的玩家 */
function findDiamond3Holders(hands) {
    return Object.entries(hands)
        .filter(([, cards]) => cards.some((c) => c.rank === constants_1.GAME.FIRST_LEAD_RANK && c.suit === constants_1.GAME.FIRST_LEAD_SUIT))
        .map(([id]) => id);
}
/** 非首局：上局失败队里仍剩手牌的玩家，随机起点 */
function buildClaimQueue(remaining, seed) {
    return (0, rng_1.seededShuffle)(remaining, seed);
}
/** 下家方向（顺时针）找最近的仍有手牌者；fromPlayerId 可以是已出完牌的人 */
function nextActivePlayer(state, fromPlayerId) {
    const order = seatOrder(state.players);
    const idx = order.findIndex((p) => p.id === fromPlayerId);
    if (idx < 0)
        return '';
    for (let step = 1; step <= order.length; step++) {
        const p = order[(idx + step) % order.length];
        if (hasCards(state, p.id))
            return p.id;
    }
    return '';
}
/** 上家方向（逆时针）找最近的仍有手牌者，跳过已出完牌的人 */
function previousActivePlayer(state, fromPlayerId) {
    const order = seatOrder(state.players);
    const idx = order.findIndex((p) => p.id === fromPlayerId);
    if (idx < 0)
        return '';
    for (let step = 1; step <= order.length; step++) {
        const p = order[(idx - step + order.length) % order.length];
        if (hasCards(state, p.id))
            return p.id;
    }
    return '';
}
/**
 * 「接风」：最后一手牌的玩家已出完牌、其余人全 pass 时，由谁领出新回合。
 * 已确认：A 的上家 B；B 也完牌则继续往上家方向回退，直到找到有手牌者。
 */
function pickWindfallLeader(state, finishedPlayerId) {
    if (constants_1.TURN.leadAfterFinished === 'lowerSeat')
        return nextActivePlayer(state, finishedPlayerId);
    if (constants_1.TURN.leadAfterFinished === 'teammate') {
        const team = teamOf(state, finishedPlayerId);
        const order = seatOrder(state.players);
        const idx = order.findIndex((p) => p.id === finishedPlayerId);
        for (let step = 1; step <= order.length; step++) {
            const p = order[(idx + step) % order.length];
            if (p.team === team && hasCards(state, p.id))
                return p.id;
        }
    }
    return previousActivePlayer(state, finishedPlayerId);
}
/** 本回合是否结束：除最后一手牌的玩家外，所有仍可出牌的人都 pass 了 */
function isTrickOver(state) {
    if (!state.lastPlayerId)
        return false;
    const active = state.players
        .filter((p) => (state.hands[p.id]?.length ?? 0) > 0)
        .map((p) => p.id);
    return active.every((id) => id === state.lastPlayerId || state.passedPlayerIds.includes(id));
}
/**
 * 局末把尚未结算的牌池判给「最后一手牌」玩家的队（已确认）。
 * 某队第 3 人出完牌时本局立即结束，此时最后一回合往往还没打完；
 * 不清算会让这些分凭空消失，破坏 400 分守恒。
 */
function settleRemainingPot(state) {
    if (state.pot.length === 0)
        return { team: null, points: 0 };
    const points = (0, cards_1.totalPoints)(state.pot);
    const team = teamOf(state, state.lastPlayerId);
    if (team)
        state.teams[team].captured += points;
    state.pot = [];
    state.currentPlay = null;
    state.passedPlayerIds = [];
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
function calcRoundResult(state, winnerTeam) {
    const discarded = Object.values(state.hands).reduce((sum, hand) => sum + (0, cards_1.totalPoints)(hand), 0);
    const captured = {
        A: state.teams.A.captured,
        B: state.teams.B.captured,
    };
    const upstreamTeam = state.upstreamPlayerId ? teamOf(state, state.upstreamPlayerId) : null;
    const tribute = upstreamTeam === winnerTeam ? constants_1.GAME.TRIBUTE_POINTS : 0;
    const delta = {
        A: captured.A + (winnerTeam === 'A' ? tribute : -tribute),
        B: captured.B + (winnerTeam === 'B' ? tribute : -tribute),
    };
    const valid = captured.A + captured.B + discarded === constants_1.GAME.TOTAL_POINTS_PER_ROUND;
    return { winnerTeam, captured, discarded, tribute, delta, valid };
}
function isMatchOver(state) {
    return state.teams.A.matchScore >= constants_1.GAME.MATCH_TARGET_SCORE
        || state.teams.B.matchScore >= constants_1.GAME.MATCH_TARGET_SCORE;
}
function canStart(phase, playerCount) {
    if (phase !== 'lobby')
        return { ok: false, error: '牌局已开始' };
    if (playerCount !== constants_1.GAME.PLAYER_COUNT) {
        return { ok: false, error: `需要 ${constants_1.GAME.PLAYER_COUNT} 人，还差 ${constants_1.GAME.PLAYER_COUNT - playerCount} 人` };
    }
    return { ok: true };
}
/** 供 UI 排序手牌时使用：大到小 */
function compareCardDesc(a, b) {
    return cards_1.RANK_POWER[b.rank] - cards_1.RANK_POWER[a.rank];
}
