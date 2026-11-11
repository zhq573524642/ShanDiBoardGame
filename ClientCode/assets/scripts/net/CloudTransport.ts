import { sys } from 'cc';
import { AppConfig, ClientMsg, ServerMsg, decode, encode } from '../shared/protocol';
import { ITransport, MessageHandler } from './ITransport';

const TOKEN_KEY = 'poker.token';
const WS_OPEN = 1;

/** 云端模式：WebSocket 连到权威服务，支持 token 断线重连 */
export class CloudTransport implements ITransport {
  readonly mode = 'cloud' as const;
  private ws: WebSocket | null = null;
  private handler: MessageHandler = () => {};
  private retry = 0;
  private closedByUser = false;

  constructor(private readonly cfg: AppConfig) {}

  connect(): Promise<void> {
    this.closedByUser = false;
    return new Promise((resolve, reject) => {
      const url = `${this.cfg.cloudUrl}?room=${encodeURIComponent(this.cfg.roomId)}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;

      ws.onopen = () => {
        this.retry = 0;
        const token = sys.localStorage.getItem(TOKEN_KEY) || '';
        if (token) {
          this.sendNow({ t: 'resume', token });
        } else {
          this.sendNow({
            t: 'join', playerId: this.cfg.playerId,
            nickname: this.cfg.nickname, roomId: this.cfg.roomId,
          });
        }
        settled = true;
        resolve();
      };
      ws.onmessage = (ev) => {
        const msg = decode<ServerMsg>(String(ev.data));
        if (!msg) return;
        if (msg.t === 'welcome') sys.localStorage.setItem(TOKEN_KEY, msg.token);
        this.handler(msg);
      };
      ws.onerror = () => {
        if (!settled) reject(new Error('云端连接失败'));
      };
      ws.onclose = () => {
        if (!this.closedByUser) this.scheduleReconnect();
      };
    });
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WS_OPEN) this.sendNow(msg);
    else console.warn('[cloud] 连接未就绪，动作被丢弃：' + msg.t);
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }

  private sendNow(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WS_OPEN) this.ws.send(encode(msg));
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    this.retry++;
    const delay = Math.min(1000 * 2 ** this.retry, 15000);
    setTimeout(() => {
      this.connect().catch(() => { /* 下一次 onclose 会继续重试 */ });
    }, delay);
  }
}
