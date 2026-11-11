import { AppConfig, ClientMsg, ServerMsg, decode, encode } from '../shared/protocol';
import { Delivery, ITransport, MessageHandler } from './ITransport';
import { NativeBridge } from './NativeBridge';
import { LanAuthority } from './LanAuthority';

const LOCAL_PEER = 'local';

/**
 * 近场模式传输层。
 * isHost=true  ：本机跑 LanAuthority，既是玩家也是权威端，其余设备通过 TCP 接入。
 * isHost=false ：只把 ClientMsg 转发给房主，收 ServerMsg 交给 UI。
 */
export class LanTransport implements ITransport {
  readonly mode = 'lan' as const;
  private handler: MessageHandler = () => {};
  private authority?: LanAuthority;

  constructor(
    private readonly cfg: AppConfig,
    private readonly isHost: boolean,
    private readonly hostAddr = '',
  ) {}

  async connect(): Promise<void> {
    if (!NativeBridge.available) throw new Error('近场直连只支持 Android 原生包，请在设置里切到云端模式');

    NativeBridge.onError((m) => {
      if (m.startsWith('peer_lost:')) {
        this.authority?.onPeerLost(m.slice('peer_lost:'.length));
        return;
      }
      console.error('[lan] ' + m);
    });
    NativeBridge.onMessage((raw, peerId) => {
      if (this.isHost) {
        this.authority?.onPeerMessage(peerId, raw);
      } else {
        const msg = decode<ServerMsg>(raw);
        if (msg) this.handler(msg);
      }
    });

    const joinMsg: ClientMsg = {
      t: 'join', playerId: this.cfg.playerId,
      nickname: this.cfg.nickname, roomId: this.cfg.roomId,
    };

    if (this.isHost) {
      const delivery: Delivery = (peerId, _playerId, msg) => {
        if (peerId === LOCAL_PEER) this.handler(msg);
        else NativeBridge.sendTo(peerId, encode(msg));
      };
      this.authority = new LanAuthority(this.cfg, delivery);
      NativeBridge.startHost(this.cfg.roomId, this.cfg.lanUdpPort, this.cfg.lanTcpPort);
      this.send(joinMsg);
    } else {
      NativeBridge.onConnected(() => this.send(joinMsg));
      NativeBridge.connectTo(this.hostAddr, this.cfg.lanTcpPort);
    }
  }

  send(msg: ClientMsg): void {
    if (this.isHost) this.authority?.onPeerMessage(LOCAL_PEER, encode(msg));
    else NativeBridge.send(encode(msg));
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  close(): void {
    NativeBridge.stop();
  }
}
