"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresStore = exports.InMemoryStore = void 0;
class InMemoryStore {
    snapshots = new Map();
    actions = [];
    results = [];
    async saveSnapshot(roomId, snapshot) {
        this.snapshots.set(roomId, snapshot);
    }
    async loadSnapshot(roomId) {
        return this.snapshots.get(roomId) ?? null;
    }
    async appendAction(log) {
        this.actions.push(log);
    }
    async saveResult(result) {
        this.results.push(result);
    }
    async listActions(roomId) {
        return this.actions.filter((a) => a.roomId === roomId);
    }
}
exports.InMemoryStore = InMemoryStore;
/**
 * 生产实现接线点。安装 pg 后把 pool 换成真实 Pool，执行下面的建表语句即可。
 * 家庭规模单表足够，不需要分库分表，也不需要 Redis 集群。
 *
 * CREATE TABLE match_snapshot (
 *   room_id TEXT PRIMARY KEY,
 *   state JSONB NOT NULL,
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 * );
 * CREATE TABLE match_action (
 *   id BIGSERIAL PRIMARY KEY,
 *   room_id TEXT NOT NULL,
 *   seq INT NOT NULL,
 *   player_id TEXT NOT NULL,
 *   action_type TEXT NOT NULL,
 *   at TIMESTAMPTZ NOT NULL DEFAULT now()
 * );
 * CREATE INDEX ON match_action (room_id, seq);
 * CREATE TABLE match_result (
 *   room_id TEXT NOT NULL,
 *   winners TEXT[] NOT NULL,
 *   detail TEXT,
 *   finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
 * );
 */
class PostgresStore {
    pool;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(pool) {
        this.pool = pool;
    }
    async saveSnapshot(roomId, snapshot) {
        await this.pool.query('INSERT INTO match_snapshot (room_id, state, updated_at) VALUES ($1,$2,now()) ' +
            'ON CONFLICT (room_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()', [roomId, JSON.stringify(snapshot)]);
    }
    async loadSnapshot(roomId) {
        const r = await this.pool.query('SELECT state FROM match_snapshot WHERE room_id = $1', [roomId]);
        return r.rows[0]?.state ?? null;
    }
    async appendAction(log) {
        await this.pool.query('INSERT INTO match_action (room_id, seq, player_id, action_type) VALUES ($1,$2,$3,$4)', [log.roomId, log.seq, log.playerId, log.actionType]);
    }
    async saveResult(result) {
        await this.pool.query('INSERT INTO match_result (room_id, winners, detail) VALUES ($1,$2,$3)', [result.roomId, result.winners, result.detail]);
    }
    async listActions(roomId) {
        const r = await this.pool.query('SELECT room_id, seq, player_id, action_type, at FROM match_action WHERE room_id = $1 ORDER BY seq', [roomId]);
        return r.rows;
    }
}
exports.PostgresStore = PostgresStore;
