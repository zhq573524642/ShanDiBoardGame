import { _decorator, Component, Label } from 'cc';
import { AppConfig, ServerMsg, ViewState } from './shared/protocol';
import { hashString, randomSeed } from './shared/rng';
import { GAME, FEATURES } from './shared/constants';
import { loadConfig } from './config/AppConfig';
import { ITransport } from './net/ITransport';
import { createTransport } from './net/TransportFactory';
import { TableView } from './ui/TableView';
import { HandView } from './ui/HandView';

const { ccclass, property } = _decorator;

/**
 * 牌桌入口，挂在 Canvas 下的 GameRoot 节点。
 * 编辑器里绑定：statusLabel / tableView / handView；createRoom 决定本机是否当房主。
 *
 * 这一层不知道权威在云端还是房主手机，只发 ClientMsg、收 ViewState，
 * 所以近场 / 云端共用全部 UI 代码。
 */
@ccclass('GameController')
export class GameController extends Component {
  @property(Label) statusLabel: Label | null = null;
  @property(TableView) tableView: TableView | null = null;
  @property(HandView) handView: HandView | null = null;
  @property createRoom = false;

  private cfg!: AppConfig;
  private transport?: ITransport;
  private view?: ViewState;
  private myPlayerId = '';
  private seed = '';
  private seedCommitted = false;
  private seedRevealed = false;
  /** 最近一条权威端事件（接风、进贡、结算等），显示在状态栏 */
  private lastEvent = '';

  async onLoad(): Promise<void> {
    this.cfg = loadConfig();
    if (this.handView) {
      this.handView.layout = this.cfg.handLayout;
    }
    this.transport = await createTransport(this.cfg, { forceHost: this.createRoom });
    this.transport.onMessage((msg) => this.onServerMessage(msg));
    await this.transport.connect();
  }

  onDestroy(): void {
    this.transport?.close();
  }

  private onServerMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.myPlayerId = msg.playerId;
        this.view = msg.state;
        break;
      case 'state':
        this.view = msg.state;
        break;
      case 'event':
        this.lastEvent = msg.events[msg.events.length - 1] ?? '';
        console.log('[game] ' + msg.events.join(' / '));
        break;
      case 'proof':
        if (FEATURES.fairShuffleProof) {
          console.log('[fairness] seed=' + msg.seed + ' commitment=' + msg.commitment);
        }
        break;
      case 'error':
        console.warn('[error] ' + msg.code + ': ' + msg.message);
        if (this.statusLabel) this.statusLabel.string = msg.message;
        return;
      case 'pong':
        return;
    }
    this.driveFairness();
    this.render();
  }

  /** 每人本地贡献种子，先交哈希再公开，房主也无法操纵牌序 */
  private driveFairness(): void {
    const v = this.view;
    if (!v || !this.myPlayerId) return;
    if (v.phase === 'commit' && !v.commitments[this.myPlayerId] && !this.seedCommitted) {
      this.seed = randomSeed();
      this.seedCommitted = true;
      this.seedRevealed = false;
      this.transport?.send({ t: 'commit', commitment: hashString(this.seed) });
    } else if (v.phase === 'reveal' && this.seedCommitted && !this.seedRevealed) {
      this.seedRevealed = true;
      this.transport?.send({ t: 'reveal', seed: this.seed });
    } else if (v.phase === 'lobby' || v.phase === 'matchEnd') {
      this.seedCommitted = false;
      this.seedRevealed = false;
    }
  }

  // ---- UI 按钮回调（在 Cocos 编辑器里绑定）----

  public onStartClick(): void {
    this.transport?.send({ t: 'start' });
  }

  public onNextRoundClick(): void {
    this.transport?.send({ t: 'nextRound' });
  }

  public onClaimFirstClick(): void {
    this.transport?.send({ t: 'claimFirst' });
  }

  public onDeclineFirstClick(): void {
    this.transport?.send({ t: 'declineFirst' });
  }

  public onPlayClick(): void {
    const v = this.view;
    const ids = this.handView?.selectedCardIds ?? [];
    if (!v || ids.length === 0) return;
    this.transport?.send({ t: 'play', seq: v.seq, cardIds: ids });
    this.handView?.clearSelection();
  }

  public onPassClick(): void {
    const v = this.view;
    if (!v) return;
    this.transport?.send({ t: 'pass', seq: v.seq });
  }

  /** 当前界面应该显示哪些操作，供 UI 控制按钮显隐 */
  public get availableActions(): string[] {
    const v = this.view;
    if (!v) return [];
    const actions: string[] = [];
    if (v.phase === 'lobby' && v.hostId === this.myPlayerId) actions.push('start');
    if (v.phase === 'roundSettle' && v.hostId === this.myPlayerId) actions.push('nextRound');
    if (v.phase === 'claimFirst') {
      if (v.firstLeadMode === 'diamond3') {
        if (v.selfHand.some((c) => c.rank === GAME.FIRST_LEAD_RANK && c.suit === GAME.FIRST_LEAD_SUIT)) {
          actions.push('claimFirst');
        }
      } else if (v.claimPlayerId === this.myPlayerId) {
        actions.push('claimFirst', 'declineFirst');
      }
    }
    if (v.phase === 'playing' && v.turnPlayerId === this.myPlayerId) {
      actions.push('play');
      if (v.currentPlay) actions.push('pass');
    }
    return actions;
  }

  private render(): void {
    const v = this.view;
    if (!v) return;
    this.tableView?.render(v);
    this.handView?.pruneSelection(new Set(v.selfHand.map((c) => c.id)));
    this.handView?.render(v.selfHand);
    if (this.statusLabel) {
      const turn = v.players.find((p) => p.id === v.turnPlayerId)?.nickname ?? '-';
      this.statusLabel.string =
        `第 ${v.roundNo} 局 · A ${v.teams.A.matchScore} : ${v.teams.B.matchScore} B · ` +
        `我的手牌 ${v.selfHand.length} 张 · 轮到 ${turn} · 可操作：${this.availableActions.join('/') || '无'}` +
        (this.lastEvent ? `\n${this.lastEvent}` : '');
    }
  }
}
