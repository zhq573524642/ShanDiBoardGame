import {
  _decorator, Component, Node, Graphics, Label, Color, UITransform,
} from 'cc';
import { ViewState } from '../shared/protocol';
import { currentPhaseLabel } from '../shared/engine';
import { totalPoints } from '../shared/cards';
import { seatOrder } from '../shared/rules';

const { ccclass } = _decorator;

/**
 * 纯 Graphics 绘制的卡通牌桌（类似 QQ 斗地主风格）：
 * 椭圆绿呢桌面、六人座位、队伍色标、中间牌池信息。
 * 全部为系统绘制，后期可整块替换为美术导出的预制体。
 */
@ccclass('TableView')
export class TableView extends Component {
  private _gfx: Graphics | null = null;
  private _seatLabels: Label[] = [];
  private _seatNodes: Node[] = [];
  private _info: Label | null = null;

  onLoad(): void {
    this.getComponent(UITransform) ?? this.addComponent(UITransform);
    this._gfx = this.addComponent(Graphics);

    for (let i = 0; i < 6; i++) {
      const n = new Node('seat-' + i);
      n.parent = this.node;
      n.addComponent(UITransform).setContentSize(150, 58);
      const label = n.addComponent(Label);
      label.fontSize = 17;
      label.lineHeight = 22;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      this._seatNodes.push(n);
      this._seatLabels.push(label);
    }

    const infoNode = new Node('info');
    infoNode.parent = this.node;
    infoNode.addComponent(UITransform).setContentSize(560, 120);
    infoNode.setPosition(0, 0, 0);
    this._info = infoNode.addComponent(Label);
    this._info.fontSize = 19;
    this._info.lineHeight = 27;
    this._info.color = new Color(238, 244, 238);
    this._info.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._info.verticalAlign = Label.VerticalAlign.CENTER;

    this.drawTable();
  }

  private drawTable(): void {
    const g = this._gfx;
    if (!g) return;
    g.clear();
    g.fillColor = new Color(20, 62, 44);
    g.ellipse(0, 0, 540, 280);
    g.fill();
    g.strokeColor = new Color(96, 58, 32);
    g.lineWidth = 14;
    g.ellipse(0, 0, 540, 280);
    g.stroke();
    g.strokeColor = new Color(255, 255, 255, 60);
    g.lineWidth = 2;
    g.ellipse(0, 0, 500, 248);
    g.stroke();
  }

  render(view: ViewState): void {
    const g = this._gfx;
    if (!g) return;
    this.drawTable();

    // 严格按出牌顺序排座位：自己在正下方，顺时针下家依次往左下绕桌一圈。
    // seatOrder 是引擎唯一的顺序定义，改 TURN.seatDirection 时这里自动跟随。
    const order = seatOrder(view.players);
    const selfIdx = Math.max(0, order.findIndex((p) => p.id === view.selfPlayerId));
    order.forEach((p, i) => {
      const rel = (i - selfIdx + order.length) % order.length;
      const angle = (-90 - rel * 60) * Math.PI / 180;
      const x = 470 * Math.cos(angle);
      const y = 220 * Math.sin(angle);
      const node = this._seatNodes[p.seat];
      if (!node) return;
      node.setPosition(x, y, 0);

      const isTurn = p.id === view.turnPlayerId;
      g.fillColor = isTurn ? new Color(255, 196, 62) : new Color(28, 40, 34);
      g.roundRect(x - 76, y - 29, 152, 58, 10);
      g.fill();
      g.strokeColor = p.team === 'A'
        ? new Color(232, 131, 74)
        : new Color(74, 143, 232);
      g.lineWidth = 3;
      g.roundRect(x - 76, y - 29, 152, 58, 10);
      g.stroke();

      const label = this._seatLabels[p.seat];
      if (label) {
        label.string = `${p.nickname}${p.isHost ? '(房主)' : ''}\n${p.team}队 ${p.handCount}张${p.finished ? ' 已出完' : ''}${p.online ? '' : ' 离线'}`;
        label.color = isTurn ? new Color(40, 34, 20) : new Color(240, 244, 240);
      }
    });

    if (this._info) {
      const turn = view.players.find((p) => p.id === view.turnPlayerId)?.nickname ?? '-';
      const potPoints = totalPoints(view.pot);
      this._info.string =
        `${currentPhaseLabel(view.phase)}  第 ${view.roundNo} 局\n` +
        `A ${view.teams.A.matchScore} : ${view.teams.B.matchScore} B   本回合牌池 ${potPoints} 分\n` +
        `轮到：${turn}${view.currentPlay ? ' · 上一手 ' + view.currentPlay.comboLabel : ''}`;
    }
  }
}

