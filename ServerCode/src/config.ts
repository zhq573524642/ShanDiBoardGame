import { FEATURES, GAME } from './shared/constants';

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  roomCapacity: GAME.PLAYER_COUNT,
  turnTimeoutMs: Number(process.env.TURN_TIMEOUT_MS ?? GAME.TURN_TIMEOUT_MS),
  persistSnapshots: process.env.PERSIST !== '0',
  aiTrustee: process.env.AI_TRUSTEE !== '0' && FEATURES.aiTrusteeOnDisconnect,
  firstPlayerIsHost: true,
};
