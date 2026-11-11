"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameEngine = void 0;
exports.currentPhaseLabel = currentPhaseLabel;
const cards_1 = require("./cards");
const constants_1 = require("./constants");
const rng_1 = require("./rng");
const combo_1 = require("./combo");
const R = __importStar(require("./rules"));
function initialState(roomId, hostId) {
    return {
        matchId: `match-${Date.now()}`,
        roomId,
        phase: 'lobby',
        seq: 0,
        roundNo: 0,
        hostId,
        players: [],
        hands: {},
        teams: {
            A: { captured: 0, matchScore: 0 },
            B: { captured: 0, matchScore: 0 },
        },
        pot: [],
        currentPlay: null,
        lastPlayerId: '',
        turnPlayerId: '',
        passedPlayerIds: [],
        claimQueue: [],
        claimIndex: 0,
        firstLeadMode: 'diamond3',
        prevRoundRemaining: [],
        finishedOrder: [],
        upstreamPlayerId: '',
        winnerTeam: null,
        lastRoundResult: null,
        commitments: {},
        seeds: {},
        combinedSeed: '',
        proof: null,
        shuffledDeck: [],
        lastEvents: [],
    };
}
/**
 * 与运行环境无关的权威引擎。
 * 云端在 Node 进程里跑一份，近场在房主手机里跑同一份代码。
 * 客户端只发动作、收 ViewState，因此两种模式共用全部 UI。
 */
class GameEngine {
    state;
    entries = [];
    constructor(roomId, hostId) {
        this.state = initialState(roomId, hostId);
    }
    addPlayer(id, nickname) {
        if (this.state.phase !== 'lobby')
            return false;
        if (this.entries.some((e) => e.id === id))
            return true;
        if (this.entries.length >= constants_1.GAME.PLAYER_COUNT)
            return false;
        this.entries.push({ id, nickname });
        this.state.players = this.entries.map((e, i) => ({
            id: e.id,
            nickname: e.nickname,
            seat: i,
            team: (i % 2 === 0 ? 'A' : 'B'),
            online: true,
            handCount: 0,
            isHost: e.id === this.state.hostId,
            finished: false,
        }));
        return true;
    }
    setOnline(id, online) {
        const p = this.state.players.find((x) => x.id === id);
        if (p)
            p.online = online;
    }
    /** 房主开局：进入 commit-reveal 洗牌流程 */
    start() {
        const check = R.canStart(this.state.phase, this.entries.length);
        if (!check.ok)
            return { ok: false, error: check.error };
        this.state.phase = 'commit';
        this.state.commitments = {};
        this.state.seeds = {};
        this.state.combinedSeed = '';
        this.state.proof = null;
        this.state.shuffledDeck = [];
        this.state.teams.A.matchScore = 0;
        this.state.teams.B.matchScore = 0;
        this.state.roundNo = 0;
        this.state.prevRoundRemaining = [];
        this.state.seq++;
        return { ok: true };
    }
    commit(playerId, commitment) {
        if (this.state.phase !== 'commit')
            return false;
        if (!this.entries.some((e) => e.id === playerId))
            return false;
        this.state.commitments[playerId] = commitment;
        this.state.seq++;
        if (this.entries.every((e) => !!this.state.commitments[e.id]))
            this.state.phase = 'reveal';
        return true;
    }
    reveal(playerId, seed) {
        if (this.state.phase !== 'reveal')
            return { ok: false, error: '当前不是公开种子阶段' };
        if ((0, rng_1.hashString)(seed) !== this.state.commitments[playerId]) {
            return { ok: false, error: '种子与承诺不匹配' };
        }
        this.state.seeds[playerId] = seed;
        this.state.seq++;
        if (this.entries.every((e) => !!this.state.seeds[e.id]))
            this.deal();
        return { ok: true };
    }
    deal() {
        const s = this.state;
        s.combinedSeed = (0, rng_1.combineSeeds)(Object.values(s.seeds));
        s.shuffledDeck = (0, rng_1.seededShuffle)((0, cards_1.makeDeck)(constants_1.GAME.DECK_COUNT), s.combinedSeed);
        s.proof = { seed: s.combinedSeed, commitment: (0, rng_1.hashString)(s.combinedSeed) };
        s.players = R.assignSeats(this.entries, s.combinedSeed, s.hostId);
        s.hands = R.dealCards(s.shuffledDeck, s.players);
        for (const p of s.players)
            p.handCount = s.hands[p.id].length;
        s.roundNo++;
        s.teams.A.captured = 0;
        s.teams.B.captured = 0;
        s.pot = [];
        s.currentPlay = null;
        s.lastPlayerId = '';
        s.turnPlayerId = '';
        s.passedPlayerIds = [];
        s.finishedOrder = [];
        s.upstreamPlayerId = '';
        s.winnerTeam = null;
        s.lastRoundResult = null;
        s.firstLeadMode = s.roundNo === 1 ? 'diamond3' : 'askLoser';
        s.claimQueue = s.firstLeadMode === 'askLoser'
            ? R.buildClaimQueue(s.prevRoundRemaining, s.combinedSeed)
            : [];
        s.claimIndex = 0;
        s.phase = 'claimFirst';
        s.seq++;
    }
    /** 首局：持有方片3 者先点先得；非首局：仅当前被询问者可接受 */
    claimFirst(playerId) {
        const s = this.state;
        if (s.phase !== 'claimFirst')
            return { ok: false, events: [], error: '当前不是抢先手阶段' };
        if (s.firstLeadMode === 'diamond3') {
            if (!R.findDiamond3Holders(s.hands).includes(playerId)) {
                return { ok: false, events: [], error: '你没有方片3' };
            }
        }
        else if (s.claimQueue[s.claimIndex] !== playerId) {
            return { ok: false, events: [], error: '还没轮到你决定是否先出' };
        }
        return this.beginPlaying(playerId, [`${this.nickname(playerId)} 先出牌`]);
    }
    /** 非首局：拒绝先出，问下一位；全队拒绝则随机指定该队一人（已确认） */
    declineFirst(playerId) {
        const s = this.state;
        if (s.phase !== 'claimFirst' || s.firstLeadMode !== 'askLoser') {
            return { ok: false, events: [], error: '当前不能拒绝先出' };
        }
        if (s.claimQueue[s.claimIndex] !== playerId) {
            return { ok: false, events: [], error: '还没轮到你决定是否先出' };
        }
        s.claimIndex++;
        s.seq++;
        if (s.claimIndex >= s.claimQueue.length) {
            const picked = (0, rng_1.seededShuffle)(s.claimQueue, s.combinedSeed + s.claimIndex)[0] ?? playerId;
            return this.beginPlaying(picked, ['全队都拒绝先出，随机指定先手']);
        }
        return { ok: true, events: [`${this.nickname(playerId)} 拒绝先出，继续询问`] };
    }
    /** 无人点「我先出」时的兜底（首局）：随机指定一位方片3 持有者 */
    forceFirstLead() {
        const s = this.state;
        if (s.phase !== 'claimFirst')
            return { ok: false, events: [], error: '当前不是抢先手阶段' };
        const holders = R.findDiamond3Holders(s.hands);
        if (holders.length === 0)
            return { ok: false, events: [], error: '无人持有方片3' };
        const picked = (0, rng_1.seededShuffle)(holders, s.combinedSeed + 'first')[0];
        return this.beginPlaying(picked, ['超时未抢先手，系统随机指定方片3 持有者']);
    }
    beginPlaying(playerId, prefix) {
        const s = this.state;
        s.turnPlayerId = playerId;
        s.lastPlayerId = playerId;
        s.phase = 'playing';
        s.seq++;
        return { ok: true, events: [...prefix, `第 ${s.roundNo} 局开始`] };
    }
    guard(playerId, expectedSeq) {
        const s = this.state;
        if (s.phase !== 'playing')
            return '当前不是出牌阶段';
        if (expectedSeq !== undefined && expectedSeq !== s.seq)
            return '状态版本已过期，请刷新';
        if (s.turnPlayerId !== playerId)
            return '还没轮到你';
        if (s.passedPlayerIds.includes(playerId))
            return '本回合已 pass，不能再出牌';
        return null;
    }
    play(playerId, cardIds, expectedSeq) {
        const blocked = this.guard(playerId, expectedSeq);
        if (blocked)
            return { ok: false, events: [], error: blocked };
        const s = this.state;
        const hand = s.hands[playerId] ?? [];
        if (cardIds.length === 0 || new Set(cardIds).size !== cardIds.length) {
            return { ok: false, events: [], error: '选牌无效' };
        }
        const cards = [];
        for (const id of cardIds) {
            const card = hand.find((c) => c.id === id);
            if (!card)
                return { ok: false, events: [], error: '手牌中没有选中的牌' };
            cards.push(card);
        }
        const combo = (0, combo_1.parseCombo)(cards);
        if (!combo)
            return { ok: false, events: [], error: '不是合法牌型' };
        const current = s.currentPlay ? (0, combo_1.parseCombo)(s.currentPlay.cards) : null;
        if (!(0, combo_1.canBeat)(combo, current))
            return { ok: false, events: [], error: '压不过上一手牌' };
        const ids = new Set(cardIds);
        s.hands[playerId] = hand.filter((c) => !ids.has(c.id));
        s.pot.push(...cards);
        s.currentPlay = {
            playerId, cards, comboType: combo.type, comboLabel: (0, combo_1.describeCombo)(combo),
        };
        s.lastPlayerId = playerId;
        const p = s.players.find((x) => x.id === playerId);
        if (p)
            p.handCount = s.hands[playerId].length;
        const events = [`${this.nickname(playerId)} 打出 ${combo.label}`];
        if (s.hands[playerId].length === 0) {
            if (p)
                p.finished = true;
            s.finishedOrder.push(playerId);
            if (!s.upstreamPlayerId)
                s.upstreamPlayerId = playerId;
            events.push(`${this.nickname(playerId)} 出完牌（第 ${s.finishedOrder.length} 名）`);
        }
        const winnerTeam = this.findRoundWinner();
        if (winnerTeam) {
            events.push(...this.endRound(winnerTeam));
            return { ok: true, events };
        }
        this.advanceTurn(events);
        s.seq++;
        return { ok: true, events };
    }
    pass(playerId, expectedSeq) {
        const blocked = this.guard(playerId, expectedSeq);
        if (blocked)
            return { ok: false, events: [], error: blocked };
        const s = this.state;
        if (!s.currentPlay)
            return { ok: false, events: [], error: '本回合首出不能 pass' };
        s.passedPlayerIds.push(playerId);
        s.seq++;
        const events = [`${this.nickname(playerId)} 不要`];
        this.advanceTurn(events);
        return { ok: true, events };
    }
    /** 超时：有上一手则自动 pass；首出超时自动打最小单张（默认假设，见规则确认结论） */
    handleTimeout(playerId) {
        const s = this.state;
        if (s.phase === 'claimFirst' && s.firstLeadMode === 'askLoser'
            && s.claimQueue[s.claimIndex] === playerId) {
            return this.declineFirst(playerId);
        }
        if (s.phase !== 'playing' || s.turnPlayerId !== playerId) {
            return { ok: false, events: [], error: '当前无需托管' };
        }
        if (s.currentPlay)
            return this.pass(playerId, s.seq);
        const smallest = [...(s.hands[playerId] ?? [])]
            .sort((a, b) => a.points - b.points)[0];
        return smallest
            ? this.play(playerId, [smallest.id], s.seq)
            : { ok: false, events: [], error: '无牌可出' };
    }
    /**
     * 按出牌顺序（顺时针）找下一可出牌者。
     * 已出完牌的人被跳过；已 pass 的人本回合不再有出牌权。
     * 只要还有人能出牌且没 pass，回合就继续（已确认「任一有牌下家压住即可」）。
     */
    advanceTurn(events) {
        const s = this.state;
        if (R.isTrickOver(s)) {
            this.settleTrick(events);
            return;
        }
        const order = R.seatOrder(s.players);
        const start = order.findIndex((p) => p.id === s.turnPlayerId);
        for (let step = 1; step <= order.length; step++) {
            const p = order[(start + step) % order.length];
            if (p.id === s.lastPlayerId)
                continue;
            if ((s.hands[p.id]?.length ?? 0) === 0)
                continue;
            if (s.passedPlayerIds.includes(p.id))
                continue;
            s.turnPlayerId = p.id;
            return;
        }
        this.settleTrick(events);
    }
    settleTrick(events) {
        const s = this.state;
        // 分归「最后一手牌」玩家的队；即使他已经出完牌也一样（已确认）
        const team = R.teamOf(s, s.lastPlayerId);
        const points = (0, cards_1.totalPoints)(s.pot);
        if (team) {
            s.teams[team].captured += points;
            events.push(`${this.nickname(s.lastPlayerId)} 赢下本回合，${team} 队收 ${points} 分`);
        }
        s.pot = [];
        s.currentPlay = null;
        s.passedPlayerIds = [];
        const leader = s.lastPlayerId;
        const leaderFinished = (s.hands[leader]?.length ?? 0) === 0;
        // 接风：赢家已出完牌 → 上家方向最近的有牌者开启新回合，可出任意牌型
        s.turnPlayerId = leaderFinished
            ? (R.pickWindfallLeader(s, leader) || R.nextActivePlayer(s, leader))
            : leader;
        if (leaderFinished && s.turnPlayerId) {
            events.push(`${this.nickname(leader)} 已出完牌，由 ${this.nickname(s.turnPlayerId)} 接风领出（可出任意牌）`);
        }
        if (!s.turnPlayerId) {
            // 全员出完牌的兜底（正常流程 findRoundWinner 会先结束本局，这里防卡死）
            events.push(...this.endRound(team ?? 'A'));
            return;
        }
        s.lastPlayerId = s.turnPlayerId;
        s.seq++;
    }
    findRoundWinner() {
        const s = this.state;
        for (const team of ['A', 'B']) {
            const members = s.players.filter((p) => p.team === team);
            if (members.length === constants_1.GAME.TEAM_SIZE && members.every((p) => p.finished))
                return team;
        }
        return null;
    }
    endRound(winnerTeam) {
        const s = this.state;
        const events = [];
        // 某队第 3 人出完牌时本局立即结束，先清算未打完的最后一回合牌池
        if (constants_1.TURN.settlePotOnRoundEnd) {
            const pending = R.settleRemainingPot(s);
            if (pending.points > 0) {
                events.push(`本局结束，末回合牌池 ${pending.points} 分归 ${pending.team ?? '无人'} 队`);
            }
        }
        const result = R.calcRoundResult(s, winnerTeam);
        s.teams.A.matchScore += result.delta.A;
        s.teams.B.matchScore += result.delta.B;
        s.winnerTeam = winnerTeam;
        s.lastRoundResult = result;
        s.prevRoundRemaining = s.players
            .filter((p) => p.team !== winnerTeam && (s.hands[p.id]?.length ?? 0) > 0)
            .map((p) => p.id);
        s.phase = R.isMatchOver(s) ? 'matchEnd' : 'roundSettle';
        s.seq++;
        events.push(`第 ${s.roundNo} 局结束：${winnerTeam} 队获胜`, `本局 A 队 ${result.delta.A >= 0 ? '+' : ''}${result.delta.A} 分，B 队 ${result.delta.B >= 0 ? '+' : ''}${result.delta.B} 分`, `累计 A ${s.teams.A.matchScore} : B ${s.teams.B.matchScore}`);
        if (result.tribute > 0)
            events.push(`上游属获胜队，进贡 ${result.tribute} 分`);
        if (!result.valid)
            events.push('警告：分数校验不平，请检查牌池记录');
        return events;
    }
    /** roomSettle 后开下一局，保留跨局累计分 */
    nextRound() {
        const s = this.state;
        if (s.phase !== 'roundSettle')
            return { ok: false, events: [], error: '当前不能开下一局' };
        s.phase = 'commit';
        s.commitments = {};
        s.seeds = {};
        s.combinedSeed = '';
        s.proof = null;
        s.seq++;
        return { ok: true, events: ['准备下一局'] };
    }
    nickname(id) {
        return this.state.players.find((p) => p.id === id)?.nickname ?? id;
    }
    /** 逐人脱敏：客户端永远拿不到他人手牌与整副牌序 */
    viewFor(playerId) {
        const s = this.state;
        return {
            matchId: s.matchId,
            roomId: s.roomId,
            phase: s.phase,
            seq: s.seq,
            roundNo: s.roundNo,
            hostId: s.hostId,
            selfPlayerId: playerId,
            players: s.players.map((p) => ({ ...p })),
            selfHand: (0, cards_1.sortHand)(s.hands[playerId] ?? []),
            teams: { A: { ...s.teams.A }, B: { ...s.teams.B } },
            pot: [...s.pot],
            currentPlay: s.currentPlay ? { ...s.currentPlay } : null,
            lastPlayerId: s.lastPlayerId,
            turnPlayerId: s.turnPlayerId,
            passedPlayerIds: [...s.passedPlayerIds],
            claimPlayerId: s.phase === 'claimFirst'
                ? (s.firstLeadMode === 'askLoser' ? (s.claimQueue[s.claimIndex] ?? '') : '')
                : '',
            firstLeadMode: s.firstLeadMode,
            upstreamPlayerId: s.upstreamPlayerId,
            winnerTeam: s.winnerTeam,
            lastRoundResult: s.lastRoundResult ? { ...s.lastRoundResult } : null,
            commitments: { ...s.commitments },
            proof: s.proof ? { ...s.proof } : null,
            lastEvents: [...s.lastEvents],
        };
    }
    setEvents(events) {
        this.state.lastEvents = events;
    }
    snapshot() {
        return JSON.parse(JSON.stringify(this.state));
    }
    restore(snapshot) {
        this.state = JSON.parse(JSON.stringify(snapshot));
        this.entries = this.state.players.map((p) => ({ id: p.id, nickname: p.nickname }));
    }
    verifyProof() {
        const proof = this.state.proof;
        if (!proof)
            return false;
        if ((0, rng_1.hashString)(proof.seed) !== proof.commitment)
            return false;
        const recomputed = (0, rng_1.seededShuffle)((0, cards_1.makeDeck)(constants_1.GAME.DECK_COUNT), proof.seed);
        return recomputed.every((c, i) => c.id === this.state.shuffledDeck[i]?.id);
    }
}
exports.GameEngine = GameEngine;
function currentPhaseLabel(phase) {
    const labels = {
        lobby: '等待玩家',
        commit: '洗牌承诺',
        reveal: '公开种子',
        claimFirst: '确定先手',
        playing: '出牌中',
        roundSettle: '本局结算',
        matchEnd: '本场结束',
    };
    return labels[phase];
}
