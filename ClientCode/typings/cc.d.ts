// 仅用于 CI / 本地类型检查的 Cocos API 占位声明，不参与 Cocos 工程编译。
// 真实工程里 Cocos Creator 3.8 自带完整 cc.d.ts。
declare module 'cc' {
  export class Color {
    constructor(r?: number, g?: number, b?: number, a?: number);
  }
  export class Vec3 { x: number; y: number; z: number; }
  export class UITransform {
    setContentSize(w: number, h: number): void;
    width: number;
    height: number;
  }
  export class Graphics {
    fillColor: Color;
    strokeColor: Color;
    lineWidth: number;
    clear(): void;
    fill(): void;
    stroke(): void;
    roundRect(x: number, y: number, w: number, h: number, r: number): void;
    ellipse(cx: number, cy: number, rx: number, ry: number): void;
    circle(cx: number, cy: number, r: number): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
  }
  export class Label {
    static HorizontalAlign: { LEFT: number; CENTER: number; RIGHT: number };
    static VerticalAlign: { TOP: number; CENTER: number; BOTTOM: number };
    string: string;
    fontSize: number;
    lineHeight: number;
    color: Color;
    horizontalAlign: number;
    verticalAlign: number;
  }
  export class Node {
    constructor(name?: string);
    static EventType: { TOUCH_END: string; TOUCH_START: string };
    parent: Node | null;
    active: boolean;
    angle: number;
    position: Vec3;
    name: string;
    setPosition(x: number, y: number, z?: number): void;
    addComponent<T>(ctor: new () => T): T;
    getComponent<T>(ctor: new () => T): T | null;
    on(type: string, callback: () => void, target?: unknown): void;
    removeAllChildren(): void;
  }
  export class Component {
    node: Node;
    addComponent<T>(ctor: new () => T): T;
    getComponent<T>(ctor: new () => T): T | null;
  }
  export const _decorator: {
    ccclass(name?: string): ClassDecorator;
    property(...args: any[]): any;
  };
  export const native: {
    reflection: {
      callStaticMethod(className: string, methodName: string, signature: string, ...args: any[]): any;
    };
  };
  export const sys: {
    isNative: boolean;
    os: number;
    OS: { ANDROID: number };
    localStorage: {
      getItem(key: string): string | null;
      setItem(key: string, value: string): void;
    };
  };
}
