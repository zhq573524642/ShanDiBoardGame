"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const node_crypto_1 = require("node:crypto");
const ws_1 = require("ws");
const protocol_1 = require("./shared/protocol");
const engine_1 = require("./shared/engine");
const store_1 = require("./store");
const config_1 = require("./config");
const rooms = new Map();
const store = new store_1.InMemoryStore();
function getRoom(id) {
    let room = rooms.get(id);
    if (!room) {
        room = { id, engine: new engine_1.GameEngine(id, ''), clients: new Map(), tokenToPlayer: new Map() };
        rooms.set(id, room);
    }
    return room;
}
function send(ws, msg) {
    if (ws.readyState === ws_1.WebSocket.OPEN)
        ws.send((0, protocol_1.encode)(msg));
}
function broadcast(room) {
    for (const c of room.clients.values()) {
        send(c.ws, { t: 'state', state: room.engine.viewFor(c.playerId) });
    }
    armTurnTimer(room);
}
function fail(client, code, message) {
    send(client.ws, { t: 'error', code, message });
}
/** 每次状态变化重置 30 秒计时；超时自动 pass / 拒绝先手 / 兜底指定先手 */
function armTurnTimer(room) {
    if (room.timer)
        clearTimeout(room.timer);
    if (!config_1.config.aiTrustee)
        return;
    const s = room.engine.state;
    if (s.phase !== 'playing' && s.phase !== 'claimFirst')
        return;
    const seqAtArm = s.seq;
    const target = s.phase === 'playing'
        ? s.turnPlayerId
        : (s.firstLeadMode === 'askLoser' ? (s.claimQueue[s.claimIndex] ?? '') : '');
    if (!target && !(s.phase === 'claimFirst' && s.firstLeadMode === 'diamond3'))
        return;
    room.timer = setTimeout(() => {
        if (room.engine.state.seq !== seqAtArm)
            return;
        let r;
        if (s.phase === 'claimFirst' && s.firstLeadMode === 'diamond3') {
            r = room.engine.forceFirstLead();
        }
        else {
            r = room.engine.handleTimeout(target);
        }
        if (!r.ok)
            return;
        room.engine.setEvents(r.events);
        for (const c of room.clients.values())
            send(c.ws, { t: 'event', events: r.events, seq: room.engine.state.seq });
        broadcast(room);
        void persist(room);
    }, config_1.config.turnTimeoutMs);
}
async function persist(room) {
    if (!config_1.config.persistSnapshots)
        return;
    const snap = room.engine.snapshot();
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
function apply(room, client, r) {
    if (!r.ok)
        return fail(client, 'ACTION_REJECTED', r.error ?? '动作被拒绝');
    const e = room.engine;
    e.setEvents(r.events);
    for (const c of room.clients.values())
        send(c.ws, { t: 'event', events: r.events, seq: e.state.seq });
    if (e.state.proof && e.state.phase === 'claimFirst') {
        for (const c of room.clients.values()) {
            send(c.ws, { t: 'proof', seed: e.state.proof.seed, commitment: e.state.proof.commitment });
        }
    }
    broadcast(room);
    void persist(room);
}
async function handle(room, client, raw) {
    const msg = (0, protocol_1.decode)(raw.toString());
    if (!msg)
        return fail(client, 'BAD_JSON', '消息格式错误');
    const e = room.engine;
    switch (msg.t) {
        case 'join': {
            const playerId = msg.playerId || (0, node_crypto_1.randomUUID)();
            if (!e.addPlayer(playerId, msg.nickname || '玩家')) {
                return fail(client, 'ROOM_FULL', `房间最多 ${config_1.config.roomCapacity} 人`);
            }
            if (config_1.config.firstPlayerIsHost && !e.state.hostId)
                e.state.hostId = playerId;
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
            if (!playerId)
                return fail(client, 'BAD_TOKEN', '重连令牌无效');
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
            if (client.playerId !== e.state.hostId)
                return fail(client, 'NOT_HOST', '只有房主能开局');
            const r = e.start();
            return apply(room, client, {
                ok: r.ok,
                events: r.ok ? ['本场游戏开始，等待洗牌种子'] : [],
                error: r.error,
            });
        }
        case 'nextRound': {
            if (client.playerId !== e.state.hostId)
                return fail(client, 'NOT_HOST', '只有房主能开下一局');
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
            if (!r.ok)
                return fail(client, 'BAD_REVEAL', r.error ?? '种子校验失败');
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
const server = node_http_1.default.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rooms: rooms.size, game: 'shandi-50k' }));
        return;
    }
    res.writeHead(404);
    res.end();
});
const wss = new ws_1.WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/ws', 'http://localhost');
    const room = getRoom(url.searchParams.get('room') ?? 'shandi-001');
    const client = { ws, playerId: '', token: (0, node_crypto_1.randomUUID)() };
    ws.on('message', (data) => {
        void handle(room, client, data).catch((err) => {
            console.error('[handle]', err);
            fail(client, 'SERVER_ERROR', '服务端处理失败');
        });
    });
    ws.on('close', () => {
        if (!client.playerId)
            return;
        e_setOffline(room, client.playerId);
    });
});
function e_setOffline(room, playerId) {
    room.engine.setOnline(playerId, false);
    room.clients.delete(playerId);
    broadcast(room);
}
server.listen(config_1.config.port, config_1.config.host, () => {
    console.log(`[shandi] ws://${config_1.config.host}:${config_1.config.port}/ws  timeout=${config_1.config.turnTimeoutMs}ms`);
});
