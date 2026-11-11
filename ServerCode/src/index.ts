import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer, RawData } from 'ws';
import { ClientMsg, ServerMsg, decode, encode, FullState } from './shared/protocol';
import { GameEngine, DispatchResult } from './shared/engine';
import { InMemoryStore, IStore } from './store';
import { config } from './config';

interface Client { ws: WebSocket; playerId: string; token: string; }
interface Room {
  id: string;
  engine: GameEngine;
  clients: Map<string, Client>;
  tokenToPlayer: Map<string, string>;
  timer?: NodeJS.Timeout;
}

const rooms = new Map<string, Room>();
const store: IStore = new InMemoryStore();

function getRoom(id: string): Room {
  let room = rooms.get(id);
  if (!room) {
    room = { id, engine: new GameEngine(id, ''), clients: new Map(), tokenToPlayer: new Map() };
    rooms.set(id, room);
  }
  return room;
}

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
}

function broadcast(room: Room): void {
  for (const c of room.clients.values()) {
    send(c.ws, { t: 'state', state: room.engine.viewFor(c.playerId) });
  }
  armTurnTimer(room);
}

function fail(client: Client, code: string, message: string): void {
  send(client.ws, { t: 'error', code, message });
}

/** 每次状态变化重置 30 秒计时；超时自动 pass / 拒绝先手 / 兜底指定先手 */
function armTurnTimer(room: Room): void {
  if (room.timer) clearTimeout(room.timer);
  if (!config.aiTrustee) return;
  const s = room.engine.state;
  if (s.phase !== 'playing' && s.phase !== 'claimFirst') return;
  const seqAtArm = s.seq;
  const target = s.phase === 'playing'
    ? s.turnPlayerId
    : (s.firstLeadMode === 'askLoser' ? (s.claimQueue[s.claimIndex] ?? '') : '');
  if (!target && !(s.phase === 'claimFirst' && s.firstLeadMode === 'diamond3')) return;

  room.timer = setTimeout(() => {
    if (room.engine.state.seq !== seqAtArm) return;
    let r: DispatchResult;
    if (s.phase === 'claimFirst' && s.firstLeadMode === 'diamond3') {
      r = room.engine.forceFirstLead();
    } else {
      r = room.engine.handleTimeout(target);
    }
    if (!r.ok) return;
    room.engine.setEvents(r.events);
    for (const c of room.clients.values()) send(c.ws, { t: 'event', events: r.events, seq: room.engine.state.seq });
    broadcast(room);
    void persist(room);
  }, config.turnTimeoutMs);
}

async function persist(room: Room): Promise<void> {
  if (!config.persistSnapshots) return;
  const snap: FullState = room.engine.snapshot();
  await store.saveSnapshot(room.id, snap);
  const result = room.engine.state.lastRoundResult;
  if (result && room.engine.state.phase === 'roundSettle') {
    await store.saveResult({
      roomId: room.id,
      winners: [result.winnerTeam],
      detail: JSON.stringify(result),
      finishedAt: Date.now(),
    });
  }
}

function apply(room: Room, client: Client, r: DispatchResult): void {
  if (!r.ok) return fail(client, 'ACTION_REJECTED', r.error ?? '动作被拒绝');
  const e = room.engine;
  e.setEvents(r.events);
  for (const c of room.clients.values()) send(c.ws, { t: 'event', events: r.events, seq: e.state.seq });
  if (e.state.proof && e.state.phase === 'claimFirst') {
    for (const c of room.clients.values()) {
      send(c.ws, { t: 'proof', seed: e.state.proof.seed, commitment: e.state.proof.commitment });
    }
  }
  broadcast(room);
  void persist(room);
}

async function handle(room: Room, client: Client, raw: RawData): Promise<void> {
  const msg = decode<ClientMsg>(raw.toString());
  if (!msg) return fail(client, 'BAD_JSON', '消息格式错误');
  const e = room.engine;

  switch (msg.t) {
    case 'join': {
      const playerId = msg.playerId || randomUUID();
      if (!e.addPlayer(playerId, msg.nickname || '玩家')) {
        return fail(client, 'ROOM_FULL', `房间最多 ${config.roomCapacity} 人`);
      }
      if (config.firstPlayerIsHost && !e.state.hostId) e.state.hostId = playerId;
      client.playerId = playerId;
      room.clients.set(playerId, client);
      room.tokenToPlayer.set(client.token, playerId);
      e.setOnline(playerId, true);
      send(client.ws, {
        t: 'welcome', playerId, hostId: e.state.hostId,
        token: client.token, state: e.viewFor(playerId),
      });
      broadcast(room);
      return;
    }

    case 'resume': {
      const playerId = room.tokenToPlayer.get(msg.token);
      if (!playerId) return fail(client, 'BAD_TOKEN', '重连令牌无效');
      client.playerId = playerId;
      client.token = msg.token;
      room.clients.set(playerId, client);
      e.setOnline(playerId, true);
      send(client.ws, {
        t: 'welcome', playerId, hostId: e.state.hostId,
        token: msg.token, state: e.viewFor(playerId),
      });
      broadcast(room);
      return;
    }

    case 'start': {
      if (client.playerId !== e.state.hostId) return fail(client, 'NOT_HOST', '只有房主能开局');
      const r = e.start();
      return apply(room, client, {
        ok: r.ok,
        events: r.ok ? ['本场游戏开始，等待洗牌种子'] : [],
        error: r.error,
      });
    }

    case 'nextRound': {
      if (client.playerId !== e.state.hostId) return fail(client, 'NOT_HOST', '只有房主能开下一局');
      return apply(room, client, e.nextRound());
    }

    case 'commit': {
      if (!e.commit(client.playerId, msg.commitment)) {
        return fail(client, 'BAD_COMMIT', '当前阶段不能提交种子');
      }
      return apply(room, client, { ok: true, events: ['已提交洗牌种子'] });
    }

    case 'reveal': {
      const r = e.reveal(client.playerId, msg.seed);
      if (!r.ok) return fail(client, 'BAD_REVEAL', r.error ?? '种子校验失败');
      return apply(room, client, { ok: true, events: ['洗牌完成，开始发牌'] });
    }

    case 'claimFirst':
      return apply(room, client, e.claimFirst(client.playerId));

    case 'declineFirst':
      return apply(room, client, e.declineFirst(client.playerId));

    case 'play':
      return apply(room, client, e.play(client.playerId, msg.cardIds, msg.seq));

    case 'pass':
      return apply(room, client, e.pass(client.playerId, msg.seq));

    case 'ping':
      return send(client.ws, { t: 'pong' });
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, game: 'shandi-50k' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/ws', 'http://localhost');
  const room = getRoom(url.searchParams.get('room') ?? 'shandi-001');
  const client: Client = { ws, playerId: '', token: randomUUID() };

  ws.on('message', (data) => {
    void handle(room, client, data).catch((err) => {
      console.error('[handle]', err);
      fail(client, 'SERVER_ERROR', '服务端处理失败');
    });
  });
  ws.on('close', () => {
    if (!client.playerId) return;
    e_setOffline(room, client.playerId);
  });
});

function e_setOffline(room: Room, playerId: string): void {
  room.engine.setOnline(playerId, false);
  room.clients.delete(playerId);
  broadcast(room);
}

server.listen(config.port, config.host, () => {
  console.log(`[shandi] ws://${config.host}:${config.port}/ws  timeout=${config.turnTimeoutMs}ms`);
});
