# 山底五十K · 家庭扑克桌游工程

Cocos Creator 3.8 → Android APK，近场直连 / 云服务器一个开关切换，前端 + 服务端 + 共享规则引擎全 TypeScript。

## 目录约定

```
D:\workspace\ShanDiBoardGame\
├── SharedCode\      规则引擎唯一真源（纯 TS，不依赖 Cocos / Node / DOM）
├── ClientCode\      Cocos Creator 3.8 工程脚本 + 系统绘制 UI
├── ServerCode\      Node 22 + ws 云端权威服务
├── 游戏规则说明书.md     纯规则：完整流程 / 出牌与牌型 / 计分结算（给玩家与策划看，v1.3）
├── 软件安装清单.md       本机缺什么、装什么、环境变量
├── 规则确认结论.md       五轮 19 处确认 + 11 条默认假设 + 3.5 文档勘误 / 3.6 pass 新规（含计分算例、接风、三种王对、动态发牌起点）
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

---

## 换电脑继续开发（家里 / 公司两头跑）

**结论：可以继续，但「登录相同账号」只解决一部分。** 本项目把关键上下文都写进了仓库里的 Markdown，所以最省事的做法是「Git 带代码和文档 + 账号带画像 + 新会话读文档」，不必完整迁移 WorkBuddy 本地数据。

### 数据分三层

| 层 | 内容 | 换机后 |
|---|---|---|
| 随账号（云端） | 长期用户画像、历史对话检索、账号偏好、基础设置；**项目**的指令/技能/专家/连接器配置 | 登录同一账号自动回来 |
| 随 Git（本仓库） | 全部代码、`规则确认结论.md`、`开发与维护清单.md`、`软件安装清单.md`、本 README | `git clone` 后完整可用 |
| 只在本机（需手动搬） | `~/.workbuddy/` 里的技能、MCP/连接器授权、定时任务、本地记忆文件；任务产物；以及 `D:\soft\WorkBuddyWorkspace\My\.workbuddy\memory\` 下的工作日志 | **不会自动同步** |

两个容易误判的点：

- **本地任务和云端任务是两份列表**，取决于任务的执行位置。新电脑上看不到旧会话列表是正常的，用侧栏搜索 / 历史对话检索召回，或直接用下面的开场白重开一个任务。
- **连接器授权跟设备绑定**，即使做了完整迁移也要重新授权一次。

### 家里电脑一次性准备

1. 装软件：Node 22 LTS、Git、**Cocos Creator 3.8**（本机原来就缺这个）、JDK 17、Android Studio + SDK/NDK/CMake；设置 `ANDROID_HOME`。版本对照见《软件安装清单.md》。
2. `git clone <仓库地址>` → `cd ServerCode && npm install` → `npm run smoke && npm run typecheck:client`，两条都过说明环境没问题。
3. 用 Cocos Creator 打开 `ClientCode/` 生成工程文件与 `.meta`，**`.meta` 必须提交**（Cocos 靠它保存场景引用，`.gitignore` 已特意放行）。
4. 构建 Android 时勾选 WebSocket 模块，否则 APK 连不上云端。

> 仓库已加 `.gitignore` 并把误提交的 `ServerCode/node_modules/`（278 个文件）与 `ServerCode/dist/`（12 个文件）从索引移除，本地文件未删。**记得 commit + push 这次清理**，否则远端仍带着本机依赖。

### 想完整搬 WorkBuddy 家当（可选）

不搬也能开发本项目；如果需要原来的技能、定时任务、本地记忆：

1. 在技能市场安装 `workbuddy-migration-assistant`（WorkBuddy 迁移助手）。
2. 旧机导出选 **lite** 预设（跨机、不带凭证，包最小；`backup` 只适合同一台机器）。
3. 新机装好客户端 → **先登录并随便发一句话**（写入 uid，漏了这步导入完还是空的）→ 导入压缩包 → 跑预检确认 → 正式导入。
4. **完全退出客户端（含托盘）再打开**，最后到连接器面板重新授权。

长期建议：把这个项目建成 WorkBuddy「项目」，项目配置与资产库存云端，以后换设备直接打开项目就能接着干。

### 新会话开场白（直接复制）

```
我在 D:\workspace\ShanDiBoardGame 继续开发「山底五十K」Cocos 桌游。
请先读 README.md、游戏规则说明书.md、规则确认结论.md、开发与维护清单.md、软件安装清单.md，
然后告诉我当前进度、未完成的 P0 项和下一步该做什么，不要改代码。
```

### 当前进度快照（防止上下文丢失）

- 技术栈：Cocos Creator 3.8 + TypeScript / Node 22 + TypeScript / Android 原生 Kotlin 插件；`SharedCode` 是规则引擎唯一真源，由 `ServerCode/scripts/sync-shared.mjs` 同步到两端，**只改 SharedCode**。
- 规则：两轮共 15 处确认、12 条默认假设，全部在《规则确认结论.md》；标准计分算例 200/170/30 → 300/70 或 200/170；顺时针出牌、出完牌由上家接风。
- 已实现：216 张牌模型、全套牌型判定、权威状态机、commit-reveal 洗牌、脱敏视图、双模式传输层、纯系统绘制 UI、云端 ws 服务、超时托管。
- 验证：`npm run smoke`（含接风与局末牌池清算）、`npm run typecheck:client` 全绿。
- **下一步 P0（未做）**：Cocos 生成场景并绑定 `GameController` 与按钮、集成 Android 原生近场插件、双真机联调。
- 待你复核：① 压住 A 最后一手的人 C 也出完牌后是否同样接风（当前按「同样适用」）；② 顺时针参照系；③ 发牌起点默认座位 0。
- 工作日志在 `D:\soft\WorkBuddyWorkspace\My\.workbuddy\memory\2026-11-11.md`，它**不在 Git 仓库里**，想带走需手动复制或用迁移助手。
