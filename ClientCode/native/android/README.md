# Android 近场插件集成说明

`LanBridge.kt`：同一 Wi-Fi 下 UDP 广播发现房主 + TCP 长连接传 JSON。**不依赖 GMS / Google Play 服务**，国内设备可用。

## 为什么不用 Nearby Connections

Google Nearby Connections API 依赖 Google Play 服务，国内 Android 设备常见 `Nearby.CONNECTIONS_API is not available`（Stack Overflow 有国内版小米的明确案例，装上 Play 服务后才恢复）。因此改用系统原生 Socket。若需要「没有路由器也能连」的场景，再叠加 `WifiP2pManager`（Wi-Fi Direct），传输层不用改。

## 集成步骤

1. **Cocos 构建 Android 原生工程**：Cocos Creator 3.8 → 构建发布 → 平台选 Android → 构建，得到 `build/android/proj/` 下的 Gradle 工程。

2. **构建面板务必勾选 WebSocket 模块**（功能裁剪列表里），否则原生包里没有 `WebSocket` 实现，云端模式连不上，浏览器预览却正常，很容易误判。

3. **放入 Kotlin 文件**：把 `LanBridge.kt` 拷到 app 模块的源码目录，例如
   `app/src/main/java/com/yiboshi/poker/lan/LanBridge.kt`，确认 `package` 与路径一致。
   JS 侧 `NativeBridge.ts` 里的类名写死为 `com/yiboshi/poker/lan/LanBridge`，改包名要两边同时改。

4. **确认 Kotlin 与 Cocos 库可用**：Cocos 3.x 原生工程自带 `com.cocos.lib.CocosHelper` 与 `com.cocos.lib.CocosJavascriptJavaBridge`。若模块未启用 Kotlin，加 `org.jetbrains.kotlin.android` 插件。

5. **声明权限**（`AndroidManifest.xml`）：

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES"
    android:usesPermissionFlags="neverForLocation" />
```

6. **组播锁**（部分机型 UDP 广播收不到时）：

```kotlin
val wifi = getSystemService(Context.WIFI_SERVICE) as WifiManager
val lock = wifi.createMulticastLock("poker-lan")
lock.acquire()
// 退出近场模式时 lock.release()
```

7. 构建 APK 安装到真机。浏览器预览环境不支持近场，请把模式开关切到 `cloud`。

## 调用约定

| Kotlin 静态方法 | JNI 签名 | 说明 |
|---|---|---|
| `startHost(String, int, int)` | `(Ljava/lang/String;II)V` | 房主开 TCP 服务 + UDP 应答 |
| `discover(int, int)` | `(II)V` | 客户端广播找房主（超时 ms、UDP 端口） |
| `connectTo(String, int)` | `(Ljava/lang/String;I)V` | 客户端连房主 TCP |
| `send(String)` | `(Ljava/lang/String;)V` | 客户端发给房主 |
| `sendTo(String, String)` | `(Ljava/lang/String;Ljava/lang/String;)V` | 房主定向发给某 peer |
| `stop()` | `()V` | 释放全部 Socket |

**Java → JS 回调**（必须包在 `CocosHelper.runOnGameThread` 里，代码已处理）：

| 全局回调 | 触发 |
|---|---|
| `__pokerLanOnMessage(peerId, rawJson)` | 收到一条 JSON |
| `__pokerLanOnPeers(hostsJson)` | 发现结束，返回 IP 数组 |
| `__pokerLanOnConnected()` | 客户端 TCP 连上，JS 此时才发 `join` |
| `__pokerLanOnError(msg)` | 错误；`peer_lost:<id>` 表示某设备掉线 |

## 已知边界

- 传输是**明文 TCP、无鉴权**，仅适用于可信的家庭局域网；不要在公共 Wi-Fi 使用。
- 每条消息以换行分隔，因此业务 JSON 内不能含裸换行（`JSON.stringify` 默认不会）。
- 客户端侧消息在 TCP 建连前发送会丢，所以 `LanTransport` 等 `__pokerLanOnConnected` 再发 `join`。
- 未做粘包处理之外的重试与心跳；长时间挂机可加 `ping/pong` 保活（协议里已有 `ping`）。
- 房主掉线目前按本局作废处理，插件通过 `peer_lost` 通知 JS，若要做房主迁移需增加状态快照同步。
