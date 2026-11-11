# ServerCode · Node 22 + TypeScript 云端权威服务

## 命令

```bash
npm install
npm run build              # 同步 SharedCode + tsc 编译到 dist/
npm start                  # 启动 ws://0.0.0.0:8080/ws
npm run smoke              # 编译 + 规则引擎全链路自测
npm run typecheck:client   # 检查客户端脚本类型（不需要装 Cocos）
```

`GET /health` 返回 `{ ok, rooms, game }`，用于探活。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8080` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `TURN_TIMEOUT_MS` | `30000` | 出牌超时，到时自动 pass / 拒绝先手 |
| `AI_TRUSTEE` | `1` | 置 `0` 关闭超时托管 |
| `PERSIST` | `1` | 置 `0` 关闭快照存储 |

规则常量（人数、目标分、进贡分、超时等）统一在 `SharedCode/constants.ts → GAME`。

## 结构

| 文件 | 作用 |
|---|---|
| `src/index.ts` | WebSocket 房间、消息分发、逐人脱敏广播、超时定时器、HTTP 探活 |
| `src/config.ts` | 环境变量 |
| `src/store.ts` | `InMemoryStore`（默认）/ `PostgresStore`（含建表 SQL 注释） |
| `src/smoke.ts` | 牌型 / 等级链 / 进贡结算 / 分数守恒 / 快照 / 验牌自测 |
| `src/shared/` | `SharedCode/` 同步副本，不要手改 |
| `scripts/sync-shared.mjs` | 同步规则引擎到服务端与客户端 |

## 消息协议

统一定义在 `SharedCode/protocol.ts`：`ClientMsg`（join / resume / start / nextRound / commit / reveal / claimFirst / declineFirst / play / pass / ping）与 `ServerMsg`（welcome / state / event / proof / error / pong）。

- 连接地址：`ws://host:8080/ws?room=房间ID`
- 客户端发 `join` 后拿到 `token`，断线重连发 `resume`
- `play` / `pass` 带 `seq`，服务端用 `GameEngine` 拒绝过期或重放消息
- 每个玩家收到的 `state` 是各自脱敏的 `ViewState`，不含他人手牌

## 存储

默认 `InMemoryStore`，**不需要数据库就能跑**。要战绩 / 排行榜 / 回放时：

```bash
npm install pg
```

把 `src/index.ts` 里的 `const store: IStore = new InMemoryStore()` 换成 `PostgresStore`（`src/store.ts` 注释里有完整建表 SQL：`match_snapshot` / `match_action` / `match_result`）。家庭规模单表 + 每日 `pg_dump` 足够，不需要 RDS 或 Redis 集群。

## 部署（异地联机）

1. 2核4G / 60GB SSD 轻量服务器，Ubuntu 22.04，装 Node 22。
2. `npm ci && npm run build`，用 `pm2 start dist/index.js --name shandi` 守护。
3. Nginx 反代 `/ws` 并配 Let's Encrypt 证书，客户端改用 `wss://域名/ws`。
4. 只放行必要端口；近场模式不经过服务器。

首年活动价约 ¥188–379，**续费按标准价 ¥65–70/月 做预算**。
