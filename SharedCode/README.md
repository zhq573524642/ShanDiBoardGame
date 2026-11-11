# SharedCode · 规则引擎唯一真源

纯 TypeScript，**不得依赖 Cocos、Node、DOM 或任何平台 API**。同一份源码编译到三处：Cocos 客户端、近场房主手机、云端服务，保证牌型判定绝对一致。

## 文件分工

| 文件 | 职责 |
|---|---|
| `cards.ts` | 4 副 216 张牌模型（`deckIndex` 去重）、点数/花色两套顺序、5/10/K 计分、手牌排序 |
| `constants.ts` | **所有规则常量与可配置项**：`GAME` / `NET` / `UI` / `FEATURES` / `ASSUMPTIONS` |
| `protocol.ts` | `AppConfig`、完整状态 `FullState`、脱敏视图 `ViewState`、客户端/服务端消息 |
| `rng.ts` | 确定性洗牌、种子合并、`hashString` |
| `combo.ts` | 牌型识别 `parseCombo()` 与压制判定 `canBeat()`，含等级表 `LEVEL` |
| `rules.ts` | 纯规则函数：分队、发牌、先手候选、回合推进、局末计分 |
| `engine.ts` | `GameEngine` 状态机：commit-reveal 洗牌、出牌/pass、超时托管、结算、快照、验牌 |
| `index.ts` | 统一导出 |

## 修改规则的正确流程

1. 先更新根目录《规则确认结论.md》，对齐认知。
2. 调数值 / 开关 → 只改 `constants.ts`。
3. 调牌型或压制 → 改 `combo.ts`，同时在 `ServerCode/src/smoke.ts` 补用例。
4. 调流程或结算 → 改 `rules.ts` / `engine.ts`，同样补用例。
5. 跑 `cd ServerCode && npm run build && npm run smoke`（build 会自动同步到两端）。
6. 跑 `npm run typecheck:client` 确认客户端脚本没被破坏。

**不要手改** `ServerCode/src/shared/` 与 `ClientCode/assets/scripts/shared/`，它们是生成副本。同步脚本只覆盖内容、不删目录，以保留 Cocos 的 `.meta`（GUID）。

## 两套点数顺序（最容易搞混）

- **比较大小**：`RANK_POWER` = `3 < 4 < … < K < A < 2 < 小王 < 大王`，用于单张 / 对子 / 同点 N 张。
- **顺子连对连续**：`SEQUENCE_RANKS` = `[A,2,3,4,5,6,7,8,9,10,J,Q,K]`，A 只在最低位、2 紧随 A、K 最大，K 后不接 A。

两者不是同一个顺序，改牌型时务必分清。

## 待改进

- `rng.ts` 的 `hashString` 是 FNV 变体，只保证跨端一致，**不是密码学哈希**；对外发布前替换为 SHA-256，接口不变。
- `FullState` 缺 `schemaVersion`，`restore()` 是裸 JSON；加字段后建议补版本迁移。
- 纯王「5 张王可压 7 张以上」目前实现为压到同点 `N+2` 张，见《规则确认结论.md》默认假设 A4。
