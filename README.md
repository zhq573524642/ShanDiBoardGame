# 山底五十K · 家庭扑克桌游工程

Cocos Creator 3.8 → Android APK，近场直连 / 云服务器一个开关切换，前端 + 服务端 + 共享规则引擎全 TypeScript。

## 目录约定

```
D:\workspace\ShanDiBoardGame\
├── SharedCode\      规则引擎唯一真源（纯 TS，不依赖 Cocos / Node / DOM）
├── ClientCode\      Cocos Creator 3.8 工程脚本 + 系统绘制 UI
├── ServerCode\      Node 22 + ws 云端权威服务
├── 软件安装清单.md       本机缺什么、装什么、环境变量
├── 规则确认结论.md       两轮 15 处确认 + 12 条默认假设（含计分算例与接风规则）
└── 开发与维护清单.md     后续要增加/优化的事项
```

> `SharedCode/` 是第三个目录，因为规则引擎要被客户端、近场房主、云端服务三处复用；放在任一单边都会导致两边各写一份、逻辑分叉。若你坚持只保留两个目录，把它移进 `ServerCode/` 并同步改 `scripts/sync-shared.mjs` 的路径即可。

## 数据流

```
                  ┌─ CloudTransport ── WebSocket ── ServerCode（权威）
GameController ───┤                                   └─ 都是同一个 GameEngine
（只认 ITransport）└─ LanTransport ─── TCP ────── 房主手机（权威）
```

- `SharedCode/` 由 `ServerCode/scripts/sync-shared.mjs` 同步到 `ServerCode/src/shared/` 与 `ClientCode/assets/scripts/shared/`。**只改 SharedCode**，生成副本不要手改。
- 客户端只发 `ClientMsg`、收逐人脱敏的 `ViewState`，永远拿不到他人手牌和整副牌序。
- 近场用 commit-reveal 洗牌：每人交 `hash(seed)` 锁死再公开，房主也无法操纵牌序，不需要云服务器。

## 快速开始

```bash
cd ServerCode
npm install
npm run smoke              # 编译 + 规则引擎全链路自测（当前全绿）
npm start                  # ws://0.0.0.0:8080/ws，GET /health 查状态
npm run typecheck:client   # 不装 Cocos 也能检查客户端脚本类型
```

客户端：装好 Cocos Creator 3.8 后打开 `ClientCode/`，把 `GameController` 挂到 Canvas 下的 GameRoot 节点，绑定 `statusLabel / tableView / handView`，用编辑器把按钮绑到 `onStartClick / onClaimFirstClick / onPlayClick / onPassClick` 等 public 方法。浏览器预览先切 `cloud` 模式，真机才测 `lan`。

## 模式开关

`ClientCode/assets/scripts/config/AppConfig.ts` 的 `setMode()`：

| 值 | 行为 |
|---|---|
| `lan` | 强制近场；`GameController.createRoom = true` 表示本机当房主 |
| `cloud` | 强制云端，连 `cloudUrl` |
| `auto` | 先 UDP 探测局域网房主（2.5s），有则加入，无则自动落云端 |

公网部署时把 `SharedCode/constants.ts → NET.DEFAULT_CLOUD_URL` 改成 `wss://域名/ws`。

## 当前已实现

- 216 张牌模型（4 副 × 54，用 `deckIndex` 去重）、400 分校验
- 全部牌型识别与压制等级链（含 AA+22 特例、纯王映射）
- 分队发牌、方片3 抢先手、非首局询问与兜底、pass / 超时托管、回合结算、进贡 100、跨局累计到 1000 分
- **顺时针发牌与出牌**、出完牌后的「上家接风」链（可配置方向）、局末未结算牌池清算、400 分守恒校验
- commit-reveal 公平洗牌、局末验牌、快照恢复、逐人脱敏视图
- 云端 ws 服务（自动超时、断线重连、事件广播、可插拔存储）
- 客户端双模式传输层、纯 `Graphics + Label` 系统绘制的牌 / 牌桌 / 36 张手牌（节点池复用）
- 服务端自测与客户端类型检查

## 当前刻意留白

- Cocos 场景文件、按钮绑定、发牌动效与音效（等 UI 稿 / 音效清单）
- Android 原生近场插件尚未接进 Cocos 构建产物，步骤见 `ClientCode/README.md`
- 排行榜 / 回放的查询接口、账号体系、wss 证书、真实数据库
- `hashString` 目前是 FNV 变体，非密码学哈希；对外发布前换 SHA-256
- 近场房主掉线按「本局作废重开」处理，未做房主迁移

发现规则或实现有出入，先看《规则确认结论.md》，再改 `SharedCode/constants.ts` 的 `ASSUMPTIONS` / `TURN`，最后跑 `npm run smoke`。
标准计分算例：**赢家 200 / 输家 170 / 废弃 30** → 上游属获胜队 `300 / 70`，否则 `200 / 170`。
