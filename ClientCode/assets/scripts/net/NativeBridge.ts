import { native, sys } from 'cc';

/**
 * Cocos Creator 3.8 → Android 原生近场插件桥。
 *
 * JS 调 Java：native.reflection.callStaticMethod
 * Java 调 JS：CocosJavascriptJavaBridge.evalString(...)（必须在 GL 线程）
 *
 * 只支持 String / int / float / boolean 四种 JNI 参数类型，
 * 所以所有结构化数据一律用 JSON 字符串传递。
 */

const CLASS = 'com/yiboshi/poker/lan/LanBridge';

type LanMessageHandler = (raw: string, peerId: string) => void;
type LanPeersHandler = (hostsJson: string) => void;
type LanErrorHandler = (message: string) => void;

export class NativeBridge {
  static get available(): boolean {
    return sys.isNative && sys.os === sys.OS.ANDROID;
  }

  private static call(method: string, signature: string, ...args: unknown[]): unknown {
    if (!this.available) {
      console.warn('[LanBridge] 非 Android 原生环境，调用被忽略：' + method);
      return null;
    }
    return native.reflection.callStaticMethod(CLASS, method, signature, ...args);
  }

  static startHost(roomId: string, udpPort: number, tcpPort: number): void {
    this.call('startHost', '(Ljava/lang/String;II)V', roomId, udpPort, tcpPort);
  }

  static discover(timeoutMs: number, udpPort: number): void {
    this.call('discover', '(II)V', timeoutMs, udpPort);
  }

  static connectTo(host: string, tcpPort: number): void {
    this.call('connectTo', '(Ljava/lang/String;I)V', host, tcpPort);
  }

  static send(json: string): void {
    this.call('send', '(Ljava/lang/String;)V', json);
  }

  static sendTo(peerId: string, json: string): void {
    this.call('sendTo', '(Ljava/lang/String;Ljava/lang/String;)V', peerId, json);
  }

  static stop(): void {
    this.call('stop', '()V');
  }

  static onMessage(handler: LanMessageHandler): void {
    (globalThis as Record<string, unknown>).__pokerLanOnMessage = handler;
  }

  static onPeers(handler: LanPeersHandler): void {
    (globalThis as Record<string, unknown>).__pokerLanOnPeers = handler;
  }

  static onError(handler: LanErrorHandler): void {
    (globalThis as Record<string, unknown>).__pokerLanOnError = handler;
  }

  /** 非房主设备：TCP 真正连上房主后才发 join，避免消息被丢弃 */
  static onConnected(handler: () => void): void {
    (globalThis as Record<string, unknown>).__pokerLanOnConnected = handler;
  }

  /** auto 模式：广播探测房主，返回 host IP 或 null */
  static probe(timeoutMs: number, udpPort: number): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.available) return resolve(null);
      let done = false;
      const finish = (host: string | null) => {
        if (done) return;
        done = true;
        resolve(host);
      };
      this.onPeers((json) => {
        try {
          const hosts = JSON.parse(json) as string[];
          finish(hosts[0] ?? null);
        } catch {
          finish(null);
        }
      });
      this.discover(timeoutMs, udpPort);
      setTimeout(() => finish(null), timeoutMs + 500);
    });
  }
}
