# ClientCode · Cocos Creator 3.8 客户端

## 打开工程

装好 Cocos Creator 3.8 后，用它打开 `ClientCode/` 目录。首次打开会自动补齐 `settings/`、`.meta`、`assets/` 场景文件等工程结构。`tsconfig.check.json` + `typings/cc.d.ts` 只用于命令行类型检查，Cocos 编译时会用自带的 `cc.d.ts`。

## 场景搭建（最小可玩）

在 Canvas 下建这些节点，并挂对应脚本：

| 节点 | 组件 | 说明 |
|---|---|---|
| `GameRoot` | `GameController` | 入口；`createRoom=true` 表示本机当近场房主 |
| `TableRoot` | `TableView` | 纯 Graphics 绘制的椭圆牌桌 + 6 座位 |
| `HandRoot` | `HandView` | 36 张手牌，节点池复用 |
| `StatusLabel` | `Label` | 拖到 `GameController.statusLabel` |
| 各按钮 | `Button` | 绑定下面的 public 方法 |

`GameController` 属性绑定：`statusLabel`、`tableView`、`handView`、`createRoom`。

### 按钮 → 方法对照

| 按钮 | 方法 | 何时显示（`availableActions`） |
|---|---|---|
| 开始游戏 | `onStartClick()` | `start` |
| 下一局 | `onNextRoundClick()` | `nextRound` |
| 我先出 | `onClaimFirstClick()` | `claimFirst` |
| 拒绝先出 | `onDeclineFirstClick()` | `declineFirst` |
| 出牌 | `onPlayClick()` | `play` |
| 不要 | `onPassClick()` | `pass` |

`GameController.availableActions` 已经算好当前该显示哪些按钮，UI 层按这个数组控制 `active` 即可，不用重复判断规则。

## UI 全部是系统绘制，零外部资源

| 文件 | 作用 |
|---|---|
| `ui/CardView.ts` | `Graphics` 画圆角牌面/牌背 + `Label` 写点数花色；红桃方片红字、黑桃梅花黑字、王用红字 |
| `ui/TableView.ts` | `Graphics` 画椭圆绿呢桌、6 个座位框、队伍色标、当前回合高亮，中心显示比分与牌池分 |
| `ui/HandView.ts` | 扇形 / 平铺多行 / 分页三种布局，点击选中、出牌后自动清理选中态 |

后期拿到正式牌面图集时，**只改 `CardView.setCard()`**：把 `drawBack()` / `Label` 换成 `SpriteFrame` 赋值，`setSelected`、节点池、布局都不用动。桌面同理可整块替换成美术预制体。

布局与配色常量全在 `SharedCode/constants.ts → UI`，改那里即可（牌宽、重叠率、行数、队伍色、设计分辨率）。

## 模式开关

`config/AppConfig.ts` 提供 `setMode('lan' | 'cloud' | 'auto')`、`setCloudUrl()`、`setHandLayout()`，配置存在 `sys.localStorage`。默认 `auto`：先 UDP 找局域网房主，找不到自动落云端。

浏览器预览不支持近场，请切到 `cloud`。

## 网络层

```
net/ITransport.ts        客户端唯一网络抽象
net/CloudTransport.ts    WebSocket → 云端权威，token 断线重连
net/LanTransport.ts      近场；房主本机走 'local' 回环
net/LanAuthority.ts      房主端权威（复用 SharedCode/GameEngine）
net/NativeBridge.ts      Cocos → Android 原生桥
net/TransportFactory.ts  按开关创建 Transport
```

`assets/scripts/shared/` 是 `SharedCode/` 的同步副本，**不要手改**。

## 构建 Android APK 的关键点

1. 构建发布面板 → 平台 Android → **功能裁剪里勾选 WebSocket 模块**（不勾 APK 连不上云端，浏览器却正常）。
2. JDK 用 17（本机已装 Corretto 17）。
3. 在构建面板显式指定已装的 NDK 路径（本机有 21 / 25 / 27），别让它自动下载。
4. 建议设置 `ANDROID_HOME=C:\Users\26496\AppData\Local\Android\Sdk`。
5. 近场直连需要集成原生插件，步骤见 `native/android/README.md`；权限、MulticastLock、JNI 签名、GL 线程回调都在那份文档里。

## 常见坑

| 现象 | 原因 |
|---|---|
| APK 连不上云端、浏览器可以 | 没勾 WebSocket 模块 |
| 真机近场找不到房主 | AP 隔离、组播被禁（需 `MulticastLock`）、两台设备不在同一网段 |
| 改了规则但客户端没变 | 改的是 `assets/scripts/shared/` 副本；应改 `SharedCode/` 再跑 `npm run build` |
| 脚本组件引用丢失 | 同步脚本已保留 `.meta`，不要手动删 `shared/` 目录 |
