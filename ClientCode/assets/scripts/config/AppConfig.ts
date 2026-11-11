import { sys } from 'cc';
import { AppConfig, DEFAULT_CONFIG, NetMode } from '../shared/protocol';

const STORAGE_KEY = 'shandi.config';

/**
 * 模式开关：设置页一个 Toggle 即可切换。
 * lan = 强制近场直连 / cloud = 强制云服务器 / auto = 先找局域网房主，找不到自动落云端。
 */
export function loadConfig(): AppConfig {
  const cfg: AppConfig = { ...DEFAULT_CONFIG };
  try {
    const raw = sys.localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(cfg, JSON.parse(raw));
  } catch {
    // 首次运行或存档损坏，用默认值
  }
  if (!cfg.playerId) {
    cfg.playerId = 'p-' + Math.random().toString(36).slice(2, 10);
    saveConfig(cfg);
  }
  return cfg;
}

export function saveConfig(cfg: AppConfig): void {
  sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function setMode(mode: NetMode): AppConfig {
  const cfg = loadConfig();
  cfg.mode = mode;
  saveConfig(cfg);
  return cfg;
}

export function setCloudUrl(url: string): AppConfig {
  const cfg = loadConfig();
  cfg.cloudUrl = url;
  saveConfig(cfg);
  return cfg;
}

export function setHandLayout(layout: AppConfig['handLayout']): AppConfig {
  const cfg = loadConfig();
  cfg.handLayout = layout;
  saveConfig(cfg);
  return cfg;
}
