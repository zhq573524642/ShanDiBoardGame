import { AppConfig } from '../shared/protocol';
import { ITransport } from './ITransport';
import { CloudTransport } from './CloudTransport';
import { LanTransport } from './LanTransport';
import { NativeBridge } from './NativeBridge';

export interface TransportOptions {
  /** 界面上「创建房间」按钮置 true，「加入房间」置 false */
  forceHost?: boolean;
  /** 手动指定的房主 IP（扫描列表里选中的那一项） */
  hostAddr?: string;
}

/** 一个开关决定走哪条链路，UI 层永远拿到的都是 ITransport */
export async function createTransport(cfg: AppConfig, opts: TransportOptions = {}): Promise<ITransport> {
  if (cfg.mode === 'cloud') return new CloudTransport(cfg);

  if (cfg.mode === 'lan') {
    return new LanTransport(cfg, !!opts.forceHost, opts.hostAddr ?? '');
  }

  // auto：先找局域网房主，找不到就走云端
  if (opts.forceHost) return new LanTransport(cfg, true);
  const host = await NativeBridge.probe(cfg.lanDiscoverTimeoutMs, cfg.lanUdpPort);
  if (host) return new LanTransport(cfg, false, opts.hostAddr || host);
  return new CloudTransport(cfg);
}
