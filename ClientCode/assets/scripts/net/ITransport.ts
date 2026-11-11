import { ClientMsg, ServerMsg } from '../shared/protocol';

export type MessageHandler = (msg: ServerMsg) => void;

/**
 * 客户端唯一的网络抽象。GameController 只认这个接口，
 * 因此「近场 / 云端」切换对 UI 层零改动。
 */
export interface ITransport {
  readonly mode: 'lan' | 'cloud';
  connect(): Promise<void>;
  send(msg: ClientMsg): void;
  onMessage(handler: MessageHandler): void;
  close(): void;
}

/**
 * 近场房主把消息投递给某个玩家。
 * peerId 为 'local' 时表示房主本机，否则是原生层维护的对端 id。
 */
export type Delivery = (peerId: string, playerId: string, msg: ServerMsg) => void;
