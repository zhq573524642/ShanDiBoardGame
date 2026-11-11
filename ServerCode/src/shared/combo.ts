import {
  Card, RANK_POWER, SUIT_POWER, SEQUENCE_INDEX, isJoker,
} from './cards';
import { ASSUMPTIONS } from './constants';

/**
 * 山底五十K 牌型识别与压制判定（纯函数，无副作用）。
 *
 * 等级模型（已按规则确认结论实现）：
 *  - 基础牌型 single / pair / straight / consecPairs：只能压同类型、同张数，
 *    再按点数 / 首牌 / 花色比较。
 *  - 炸弹类 sameN(>=3) / 五十K / 纯王：按统一 level 等级链，
 *    高等级可压所有低等级（含全部基础牌型），同级再按各自规则比。
 *  - 纯王 3 张为特例（压到同点 3 张）；N>=4 张王压到同点 N+2 张。
 *  - 两张王：一对小王 / 一对大王 / 小王+大王 都是合法对子，三者**同级、互不可压**
 *    （2026-11-11 第四轮确认），但都高于所有普通对子。
 *  - 唯一特例：恰好「AA + 22」这 4 张连对，大于同张数的其他连对。
 */

export enum ComboType {
  SINGLE = 'single',
  PAIR = 'pair',
  STRAIGHT = 'straight',
  CONSEC_PAIRS = 'consecPairs',
  SAME_N = 'sameN',
  FAKE_50K = 'fake50k',
  TRUE_50K = 'true50k',
  JOKER_BOMB = 'jokerBomb',
}

export const COMBO_LABEL: Record<ComboType, string> = {
  [ComboType.SINGLE]: '单张',
  [ComboType.PAIR]: '对子',
  [ComboType.STRAIGHT]: '顺子',
  [ComboType.CONSEC_PAIRS]: '连对',
  [ComboType.SAME_N]: '同点炸',
  [ComboType.FAKE_50K]: '假五十K',
  [ComboType.TRUE_50K]: '真五十K',
  [ComboType.JOKER_BOMB]: '王炸',
};

export const LEVEL = {
  SINGLE: 10,
  PAIR: 20,
  STRAIGHT: 30,
  CONSEC_PAIRS: 40,
  FAKE_50K: 95,
  TRUE_50K: 98,
  JOKER_3: 75,
  /** 同点 N 张 */
  sameN: (n: number) => 40 + n * 10,
  /** 纯王 N 张（N>=4）：压到同点 N+2 张 */
  jokerBomb: (n: number) => 65 + n * 10,
} as const;

/**
 * 三种「王对」共用的比较主键。
 * 普通点数最大为 2（RANK_POWER = 13），这里取 15+1=16，保证王对压得过任意普通对子；
 * 三者 key 与 subKey 完全相同 → canBeat 返回 false，实现「互不可压，先出者领先」。
 */
export const JOKER_PAIR_KEY = RANK_POWER.bJ + 1;

export interface Combo {
  type: ComboType;
  family: 'basic' | 'bomb';
  cards: Card[];
  level: number;
  /** 同级比较主键 */
  key: number;
  /** 次级比较键（单张花色） */
  subKey: number;
  length: number;
  label: string;
}

function make(
  type: ComboType,
  family: 'basic' | 'bomb',
  cards: Card[],
  level: number,
  key: number,
  subKey = 0,
): Combo {
  return { type, family, cards, level, key, subKey, length: cards.length, label: COMBO_LABEL[type] };
}

function seqIndex(card: Card): number {
  return SEQUENCE_INDEX[card.rank] ?? -1;
}

function isContinuous(indices: number[]): boolean {
  if (indices.length < 2) return false;
  const sorted = [...indices].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] !== 1) return false;
  }
  return true;
}

/** 识别一手牌；无法组成合法牌型时返回 null */
export function parseCombo(cards: Card[]): Combo | null {
  if (!cards || cards.length === 0) return null;
  const n = cards.length;

  // 纯王：全部为大小王且至少 3 张（3 张王是用户确认的特例）
  if (cards.every(isJoker)) {
    if (n === 1) {
      const c = cards[0];
      return make(ComboType.SINGLE, 'basic', cards, LEVEL.SINGLE, RANK_POWER[c.rank], SUIT_POWER[c.suit]);
    }
    if (n === 2) {
      // 一对小王 / 一对大王 / 小王+大王：三种王对同级、互不可压（已确认）
      return make(ComboType.PAIR, 'basic', cards, LEVEL.PAIR, JOKER_PAIR_KEY);
    }
    const level = ASSUMPTIONS.joker3BeatsSame3Only && n === 3
      ? LEVEL.JOKER_3
      : LEVEL.jokerBomb(n);
    return make(ComboType.JOKER_BOMB, 'bomb', cards, level, n);
  }

  // 五十K：恰好 3 张，点数集合 {5,10,K}
  if (n === 3) {
    const ranks = new Set(cards.map((c) => c.rank));
    if (ranks.has('5') && ranks.has('10') && ranks.has('K') && ranks.size === 3) {
      const suits = new Set(cards.map((c) => c.suit));
      if (suits.size === 1) {
        return make(ComboType.TRUE_50K, 'bomb', cards, LEVEL.TRUE_50K, SUIT_POWER[cards[0].suit]);
      }
      return make(ComboType.FAKE_50K, 'bomb', cards, LEVEL.FAKE_50K, 0);
    }
  }

  // 同点数 N 张
  const firstRank = cards[0].rank;
  if (cards.every((c) => c.rank === firstRank)) {
    if (n === 1) {
      return make(ComboType.SINGLE, 'basic', cards, LEVEL.SINGLE, RANK_POWER[firstRank], SUIT_POWER[cards[0].suit]);
    }
    if (n === 2) return make(ComboType.PAIR, 'basic', cards, LEVEL.PAIR, RANK_POWER[firstRank]);
    return make(ComboType.SAME_N, 'bomb', cards, LEVEL.sameN(n), RANK_POWER[firstRank]);
  }

  if (cards.some(isJoker)) return null;

  // 顺子：>=5 张、点数互异、按 [A,2,3…K] 连续
  const distinct = new Set(cards.map((c) => c.rank));
  if (n >= 5 && distinct.size === n) {
    const indices = cards.map(seqIndex);
    if (indices.every((i) => i >= 0) && isContinuous(indices)) {
      return make(ComboType.STRAIGHT, 'basic', cards, LEVEL.STRAIGHT, Math.min(...indices));
    }
  }

  // 连对：偶数且 >=4 张，每个点数恰好 2 张，点数连续
  if (n >= 4 && n % 2 === 0) {
    const groups = new Map<string, Card[]>();
    for (const c of cards) {
      const g = groups.get(c.rank) ?? [];
      g.push(c);
      groups.set(c.rank, g);
    }
    if ([...groups.values()].every((g) => g.length === 2) && groups.size >= 2) {
      const indices = [...groups.keys()].map((r) => SEQUENCE_INDEX[r as Card['rank']] ?? -1);
      if (indices.every((i) => i >= 0) && isContinuous(indices)) {
        // 特例：恰好 AA + 22（4 张）视为同张数连对里最大
        const isAA22 = n === 4 && groups.has('A') && groups.has('2');
        return make(ComboType.CONSEC_PAIRS, 'basic', cards, LEVEL.CONSEC_PAIRS, isAA22 ? 999 : Math.min(...indices));
      }
    }
  }

  return null;
}

/** challenger 能否压过 current；current 为 null 表示本回合首出，任意合法牌型均可 */
export function canBeat(challenger: Combo, current: Combo | null): boolean {
  if (!current) return true;

  if (challenger.family === 'basic' && current.family === 'bomb') return false;
  if (challenger.family === 'bomb' && current.family === 'basic') return true;

  if (challenger.family === 'basic' && current.family === 'basic') {
    if (challenger.type !== current.type) return false;
    if (ASSUMPTIONS.requireSameLengthForSequence
      && (challenger.type === ComboType.STRAIGHT || challenger.type === ComboType.CONSEC_PAIRS)
      && challenger.length !== current.length) return false;
    // 三种王对 key / subKey 均相同，落到下面「key 相等再比 subKey」自然得到不可互压
  } else if (challenger.family === 'bomb' && current.family === 'bomb') {
    if (challenger.level !== current.level) return challenger.level > current.level;
    if (challenger.type === ComboType.FAKE_50K && !ASSUMPTIONS.fakeFiftyKSameLevelBeats) return false;
    if (challenger.type === ComboType.SAME_N && challenger.length !== current.length) return false;
  }

  if (challenger.key !== current.key) return challenger.key > current.key;
  return challenger.subKey > current.subKey;
}

/** 供 UI 展示的中文描述 */
export function describeCombo(combo: Combo): string {
  if (combo.type === ComboType.SAME_N) return `${combo.length}张同点`;
  if (combo.type === ComboType.JOKER_BOMB) return `${combo.length}张王`;
  return combo.label;
}
