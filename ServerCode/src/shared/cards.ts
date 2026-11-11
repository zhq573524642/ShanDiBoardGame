/**
 * 山底五十K 牌模型。4 副牌、每副 54 张（含大小王），共 216 张。
 * 4 副牌里存在大量「同点同花色」的重复牌，因此 id 必须带 deckIndex。
 */

export type Suit = 'D' | 'C' | 'S' | 'H' | 'J';
export type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A' | '2' | 'sJ' | 'bJ';

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
  /** 第几副牌，0..3，用于区分完全相同的牌 */
  deckIndex: number;
  /** 5 / 10 / K 分别为 5 / 10 / 10 分，其余 0 */
  points: number;
}

export const SUITS: Suit[] = ['D', 'C', 'S', 'H'];
export const RANKS: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

/** 单张 / 对子 / 同点 N 张的点数大小：3 < … < K < A < 2 < 小王 < 大王 */
export const RANK_POWER: Record<Rank, number> = {
  '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7, '10': 8,
  J: 9, Q: 10, K: 11, A: 12, '2': 13, sJ: 14, bJ: 15,
};

/** 顺子 / 连对使用的连续序列：A 只在最低位，2 紧随 A，K 最大，K 后不接 A */
export const SEQUENCE_RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SEQUENCE_INDEX: Partial<Record<Rank, number>> = Object.fromEntries(
  SEQUENCE_RANKS.map((r, i) => [r, i]),
) as Partial<Record<Rank, number>>;

/** 花色：方片 < 梅花 < 黑桃 < 红桃（仅单张与真五十K 使用） */
export const SUIT_POWER: Record<Suit, number> = { D: 0, C: 1, S: 2, H: 3, J: 4 };
export const SUIT_LABEL: Record<Suit, string> = { D: '♦', C: '♣', S: '♠', H: '♥', J: '' };

/** 每副牌分牌总价值 = 5×4 + 10×4 + 10×4 = 100，4 副共 400 */
export const POINT_VALUE: Partial<Record<Rank, number>> = { '5': 5, '10': 10, K: 10 };

export function isJoker(card: Card): boolean {
  return card.rank === 'sJ' || card.rank === 'bJ';
}

export function makeDeck(deckCount = 4): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `${rank}${suit}-${d}`,
          rank,
          suit,
          deckIndex: d,
          points: POINT_VALUE[rank] ?? 0,
        });
      }
    }
    deck.push({ id: `sJJ-${d}`, rank: 'sJ', suit: 'J', deckIndex: d, points: 0 });
    deck.push({ id: `bJJ-${d}`, rank: 'bJ', suit: 'J', deckIndex: d, points: 0 });
  }
  return deck;
}

export function cardLabel(card: Card): string {
  if (card.rank === 'sJ') return '小王';
  if (card.rank === 'bJ') return '大王';
  return `${SUIT_LABEL[card.suit]}${card.rank}`;
}

/** 手牌展示排序：按点数从大到小，同点数按花色从大到小 */
export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) =>
    RANK_POWER[b.rank] - RANK_POWER[a.rank] || SUIT_POWER[b.suit] - SUIT_POWER[a.suit],
  );
}

export function totalPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + c.points, 0);
}
