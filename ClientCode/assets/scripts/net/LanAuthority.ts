import { GameEngine, DispatchResult } from '../shared/engine';
import { AppConfig, ClientMsg, decode } from '../shared/protocol';
import { Delivery } from './ITransport';

/**
 * 近场房主权威端：跑在房主手机的 Cocos JS 层，
 * 与云端服务用的是同一个 GameEngine / 同一份规则。
 */
export class LanAuthority {
  readonly engine: GameEngine;
  private playerToPeer = new Map<string, string>();
  private peerToPlayer = new Map<string, string>();

  constructor(cfg: AppConfig, private readonly deliver: Delivery) {
    this.engine = new GameEngine(cfg.roomId, cfg.playerId);
  }

  onPeerMessage(peerId: string, raw: string): void {
    const msg = decode<ClientMsg>(raw);
    if (!msg) return;
    const e = this.engine;

    switch (msg.t) {
      case 'join': {
        const pid = msg.playerId || 'p-' + Math.random().toString(36).slice(2, 9);
        if (!e.addPlayer(pid, msg.nickname || '玩家')) {
          return this.sendError(peerId, pid, 'ROOM_FULL', '房间最多 6 人');
        }
        this.bind(pid, peerId);
        this.deliver(peerId, pid, {
          t: 'welcome', playerId: pid, hostId: e.state.hostId,
          token: 'lan-' + pid, state: e.viewFor(pid),
        });
        this.broadcast();
        return;
      }

      case 'resume': {
        const pid = msg.token.startsWith('lan-') ? msg.token.slice(4) : '';
        if (!pid || !e.state.players.some((p) => p.id === pid)) {
          return this.sendError(peerId, pid, 'BAD_TOKEN', '重连令牌无效');
        }
        this.bind(pid, peerId);
        e.setOnline(pid, true);
        this.deliver(peerId, pid, {
          t: 'welcome', playerId: pid, hostId: e.state.hostId,
          token: msg.token, state: e.viewFor(pid),
        });
        this.broadcast();
        return;
      }

      case 'start':
        if (!this.isHost(peerId)) return this.sendError(peerId, this.pid(peerId), 'NOT_HOST', '只有房主能开局');
        return this.apply(peerId, e.start());

      case 'nextRound':
        if (!this.isHost(peerId)) return this.sendError(peerId, this.pid(peerId), 'NOT_HOST', '只有房主能开下一局');
        return this.apply(peerId, e.nextRound());

      case 'commit':
        e.commit(this.pid(peerId), msg.commitment);
        return this.apply(peerId, { ok: true, events: ['已提交洗牌种子'] });

      case 'reveal':
        return this.apply(peerId, e.reveal(this.pid(peerId), msg.seed));

      case 'claimFirst':
        return this.apply(peerId, e.claimFirst(this.pid(peerId)));

      case 'declineFirst':
        return this.apply(peerId, e.declineFirst(this.pid(peerId)));

      case 'play':
        return this.apply(peerId, e.play(this.pid(peerId), msg.cardIds, msg.seq));

      case 'pass':
        return this.apply(peerId, e.pass(this.pid(peerId), msg.seq));

      case 'ping': {
        const pid = this.pid(peerId);
        this.deliver(peerId, pid, { t: 'pong' });
        return;
      }
    }
  }

  onPeerLost(peerId: string): void {
    const pid = this.peerToPlayer.get(peerId);
    if (!pid) return;
    this.engine.setOnline(pid, false);
    this.peerToPlayer.delete(peerId);
    this.broadcast();
  }

  private apply(peerId: string, r: DispatchResult | { ok: boolean; error?: string; events?: string[] }): void {
    const pid = this.pid(peerId);
    if (!r.ok) return this.sendError(peerId, pid, 'ACTION_REJECTED', r.error ?? '动作被拒绝');
    const events = r.events ?? [];
    this.engine.setEvents(events);
    for (const p of this.engine.state.players) {
      const to = this.playerToPeer.get(p.id) ?? 'local';
      this.deliver(to, p.id, { t: 'event', events, seq: this.engine.state.seq });
    }
    const proof = this.engine.state.proof;
    if (proof) {
      for (const p of this.engine.state.players) {
        this.deliver(this.playerToPeer.get(p.id) ?? 'local', p.id, {
          t: 'proof', seed: proof.seed, commitment: proof.commitment,
        });
      }
    }
    this.broadcast();
  }

  private broadcast(): void {
    const e = this.engine;
    for (const p of e.state.players) {
      const peerId = this.playerToPeer.get(p.id) ?? 'local';
      this.deliver(peerId, p.id, { t: 'state', state: e.viewFor(p.id) });
    }
  }

  private bind(playerId: string, peerId: string): void {
    this.playerToPeer.set(playerId, peerId);
    this.peerToPlayer.set(peerId, playerId);
    this.engine.setOnline(playerId, true);
  }

  private pid(peerId: string): string {
    return this.peerToPlayer.get(peerId) ?? '';
  }

  private isHost(peerId: string): boolean {
    return this.pid(peerId) === this.engine.state.hostId;
  }

  private sendError(peerId: string, playerId: string, code: string, message: string): void {
    this.deliver(peerId, playerId, { t: 'error', code, message });
  }
}
