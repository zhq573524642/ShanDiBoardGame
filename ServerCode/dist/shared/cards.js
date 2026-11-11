"use strict";
/**
 * 山底五十K 牌模型。4 副牌、每副 54 张（含大小王），共 216 张。
 * 4 副牌里存在大量「同点同花色」的重复牌，因此 id 必须带 deckIndex。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.POINT_VALUE = exports.SUIT_LABEL = exports.SUIT_POWER = exports.SEQUENCE_INDEX = exports.SEQUENCE_RANKS = exports.RANK_POWER = exports.RANKS = exports.SUITS = void 0;
exports.isJoker = isJoker;
exports.makeDeck = makeDeck;
exports.cardLabel = cardLabel;
exports.sortHand = sortHand;
exports.totalPoints = totalPoints;
exports.SUITS = ['D', 'C', 'S', 'H'];
exports.RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
/** 单张 / 对子 / 同点 N 张的点数大小：3 < … < K < A < 2 < 小王 < 大王 */
exports.RANK_POWER = {
    '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7, '10': 8,
    J: 9, Q: 10, K: 11, A: 12, '2': 13, sJ: 14, bJ: 15,
};
/** 顺子 / 连对使用的连续序列：A 只在最低位，2 紧随 A，K 最大，K 后不接 A */
exports.SEQUENCE_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
exports.SEQUENCE_INDEX = Object.fromEntries(exports.SEQUENCE_RANKS.map((r, i) => [r, i]));
/** 花色：方片 < 梅花 < 黑桃 < 红桃（仅单张与真五十K 使用） */
exports.SUIT_POWER = { D: 0, C: 1, S: 2, H: 3, J: 4 };
exports.SUIT_LABEL = { D: '♦', C: '♣', S: '♠', H: '♥', J: '' };
/** 每副牌分牌总价值 = 5×4 + 10×4 + 10×4 = 100，4 副共 400 */
exports.POINT_VALUE = { '5': 5, '10': 10, K: 10 };
function isJoker(card) {
    return card.rank === 'sJ' || card.rank === 'bJ';
}
function makeDeck(deckCount = 4) {
    const deck = [];
    for (let d = 0; d < deckCount; d++) {
        for (const suit of exports.SUITS) {
            for (const rank of exports.RANKS) {
                deck.push({
                    id: `${rank}${suit}-${d}`,
                    rank,
                    suit,
                    deckIndex: d,
                    points: exports.POINT_VALUE[rank] ?? 0,
                });
            }
        }
        deck.push({ id: `sJJ-${d}`, rank: 'sJ', suit: 'J', deckIndex: d, points: 0 });
        deck.push({ id: `bJJ-${d}`, rank: 'bJ', suit: 'J', deckIndex: d, points: 0 });
    }
    return deck;
}
function cardLabel(card) {
    if (card.rank === 'sJ')
        return '小王';
    if (card.rank === 'bJ')
        return '大王';
    return `${exports.SUIT_LABEL[card.suit]}${card.rank}`;
}
/** 手牌展示排序：按点数从大到小，同点数按花色从大到小 */
function sortHand(cards) {
    return [...cards].sort((a, b) => exports.RANK_POWER[b.rank] - exports.RANK_POWER[a.rank] || exports.SUIT_POWER[b.suit] - exports.SUIT_POWER[a.suit]);
}
function totalPoints(cards) {
    return cards.reduce((sum, c) => sum + c.points, 0);
}
