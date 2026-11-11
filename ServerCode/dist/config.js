"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const constants_1 = require("./shared/constants");
exports.config = {
    port: Number(process.env.PORT ?? 8080),
    host: process.env.HOST ?? '0.0.0.0',
    roomCapacity: constants_1.GAME.PLAYER_COUNT,
    turnTimeoutMs: Number(process.env.TURN_TIMEOUT_MS ?? constants_1.GAME.TURN_TIMEOUT_MS),
    persistSnapshots: process.env.PERSIST !== '0',
    aiTrustee: process.env.AI_TRUSTEE !== '0' && constants_1.FEATURES.aiTrusteeOnDisconnect,
    firstPlayerIsHost: true,
};
