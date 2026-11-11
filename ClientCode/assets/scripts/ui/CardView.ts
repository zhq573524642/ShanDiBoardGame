import {
  _decorator, Component, Node, Graphics, Label, Color, UITransform,
} from 'cc';
import { Card, cardLabel, isJoker, SUIT_LABEL } from '../shared/cards';
import { UI } from '../shared/constants';

const { ccclass, property } = _decorator;

/**
 * 纯系统绘制的扑克牌：Graphics 画牌面 + Label 写点数花色，
 * 不依赖任何外部图片 / 图集，开箱即可跑。
 *
 * 后期拿到正式牌面资源时，只需在 setCard() 里把 drawFace 换成
 * SpriteFrame 赋值，其余接口（选中、翻开、复用）不用改。
 */
@ccclass('CardView')
export class CardView extends Component {
  @property width = UI.handCardWidth;
  @property height = UI.handCardHeight;

  private _gfx: Graphics | null = null;
  private _text: Label | null = null;
  private _subText: Label | null = null;
  private _card: Card | null = null;
  private _selected = false;
  private _faceDown = false;
  private _baseY = 0;

  onLoad(): void {
    const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
    ui.setContentSize(this.width, this.height);

    this._gfx = this.addComponent(Graphics);
    this._gfx.lineWidth = 1.5;

    const textNode = new Node('rank');
    textNode.parent = this.node;
    textNode.addComponent(UITransform).setContentSize(this.width - 8, 30);
    textNode.setPosition(-this.width / 2 + 10, this.height / 2 - 20, 0);
    this._text = textNode.addComponent(Label);
    this._text.fontSize = 21;
    this._text.lineHeight = 24;
    this._text.horizontalAlign = Label.HorizontalAlign.LEFT;
    this._text.verticalAlign = Label.VerticalAlign.CENTER;

    const subNode = new Node('suit');
    subNode.parent = this.node;
    subNode.addComponent(UITransform).setContentSize(this.width - 10, 34);
    subNode.setPosition(0, -6, 0);
    this._subText = subNode.addComponent(Label);
    this._subText.fontSize = 28;
    this._subText.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._subText.verticalAlign = Label.VerticalAlign.CENTER;

    this.redraw();
  }

  setCard(card: Card | null, faceDown = false): void {
    this._card = card;
    this._faceDown = faceDown;
    this.redraw();
  }

  get card(): Card | null {
    return this._card;
  }

  setSelected(selected: boolean): void {
    if (this._selected === selected) return;
    this._selected = selected;
    this.node.setPosition(this.node.position.x, this._baseY + (selected ? 18 : 0), 0);
    this.redraw();
  }

  setBaseY(y: number): void {
    this._baseY = y;
    this.node.setPosition(this.node.position.x, y + (this._selected ? 18 : 0), 0);
  }

  setFaceDown(down: boolean): void {
    this._faceDown = down;
    this.redraw();
  }

  private redraw(): void {
    const g = this._gfx;
    if (!g) return;
    const w = this.width;
    const h = this.height;
    g.clear();

    g.fillColor = this._faceDown ? new Color(38, 92, 142) : new Color(252, 252, 249);
    g.roundRect(-w / 2, -h / 2, w, h, 8);
    g.fill();

    g.strokeColor = this._selected ? new Color(255, 196, 62) : new Color(176, 180, 186);
    g.lineWidth = this._selected ? 3 : 1.5;
    g.roundRect(-w / 2, -h / 2, w, h, 8);
    g.stroke();

    if (this._faceDown || !this._card) {
      this.drawBack(g, w, h);
      if (this._text) this._text.string = '';
      if (this._subText) this._subText.string = '';
      return;
    }

    const red = this._card.suit === 'H' || this._card.suit === 'D';
    const ink = isJoker(this._card)
      ? new Color(196, 58, 48)
      : red ? new Color(206, 48, 48) : new Color(34, 38, 44);
    if (this._text) {
      this._text.string = this._card.rank;
      this._text.color = ink;
      this._text.fontSize = this._card.rank.length > 1 ? 18 : 22;
    }
    if (this._subText) {
      this._subText.string = isJoker(this._card) ? cardLabel(this._card) : SUIT_LABEL[this._card.suit];
      this._subText.color = ink;
      this._subText.fontSize = isJoker(this._card) ? 16 : 28;
    }
  }

  /** 牌背：用细线网格占位，后期替换为正式牌背图 */
  private drawBack(g: Graphics, w: number, h: number): void {
    g.strokeColor = new Color(120, 172, 214);
    g.lineWidth = 1;
    for (let x = -w / 2 + 8; x < w / 2 - 4; x += 9) {
      g.moveTo(x, -h / 2 + 6);
      g.lineTo(x + h * 0.35, h / 2 - 6);
    }
    g.roundRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 5);
    g.stroke();
  }
}

