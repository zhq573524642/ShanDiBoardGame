import { _decorator, Component, Node, UITransform } from 'cc';
import { Card } from '../shared/cards';
import { UI } from '../shared/constants';
import { CardView } from './CardView';

const { ccclass, property } = _decorator;

/**
 * 36 张手牌展示。节点池复用，切局不销毁重建（避免频繁 GC）。
 * 扇形 / 平铺 / 分页三种布局由 UI.handLayout 配置，后期可直接换值。
 */
@ccclass('HandView')
export class HandView extends Component {
  @property layout: 'fan' | 'flat' | 'paged' = UI.handLayout;
  @property cardWidth = UI.handCardWidth;
  @property cardHeight = UI.handCardHeight;
  @property overlap = UI.handOverlapRatio;

  onSelectionChange?: (ids: string[]) => void;

  private _pool: CardView[] = [];
  private _selected = new Set<string>();

  onLoad(): void {
    this.getComponent(UITransform) ?? this.addComponent(UITransform);
  }

  render(cards: Card[]): void {
    const w = this.cardWidth;
    const h = this.cardHeight;
    const stepX = w * (1 - this.overlap);
    const visible = this.layout === 'paged' ? cards.slice(0, 18) : cards;
    const rows = this.layout === 'flat' ? UI.handRows : 1;
    const perRow = Math.ceil(visible.length / rows) || 1;

    this.ensurePool(visible.length);
    for (let i = 0; i < this._pool.length; i++) {
      const cv = this._pool[i];
      if (i >= visible.length) {
        cv.node.active = false;
        continue;
      }
      cv.node.active = true;
      let x = 0;
      let y = 0;
      if (this.layout === 'fan') {
        x = (i - (visible.length - 1) / 2) * stepX;
        y = -Math.pow((i - (visible.length - 1) / 2) / Math.max(visible.length, 1), 2) * 90;
        cv.node.angle = (i - (visible.length - 1) / 2) * 0.7;
      } else {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const countInRow = Math.min(perRow, visible.length - row * perRow);
        const rowWidth = w + (countInRow - 1) * stepX;
        x = -rowWidth / 2 + w / 2 + col * stepX;
        y = (rows - 1) * h * 0.52 - row * h * 1.04;
        cv.node.angle = 0;
      }
      cv.setCard(visible[i]);
      cv.setBaseY(y);
      cv.node.setPosition(x, cv.node.position.y, 0);
      cv.setSelected(this._selected.has(visible[i].id));
    }
  }

  toggle(cardId: string): void {
    if (this._selected.has(cardId)) this._selected.delete(cardId);
    else this._selected.add(cardId);
    this.onSelectionChange?.(this.selectedCardIds);
  }

  get selectedCardIds(): string[] {
    return [...this._selected];
  }

  clearSelection(): void {
    this._selected.clear();
    for (const cv of this._pool) cv.setSelected(false);
    this.onSelectionChange?.([]);
  }

  /** 出牌成功后清掉已不在手牌里的选中项 */
  pruneSelection(handIds: Set<string>): void {
    for (const id of [...this._selected]) {
      if (!handIds.has(id)) this._selected.delete(id);
    }
  }

  private ensurePool(size: number): void {
    while (this._pool.length < size) {
      const node = new Node('card-' + this._pool.length);
      node.parent = this.node;
      node.addComponent(UITransform);
      const cv = node.addComponent(CardView);
      node.on(Node.EventType.TOUCH_END, () => {
        const card = cv.card;
        if (card) this.toggle(card.id);
      }, this);
      this._pool.push(cv);
    }
  }
}
