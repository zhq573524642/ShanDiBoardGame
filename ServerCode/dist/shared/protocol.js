"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.encode = encode;
exports.decode = decode;
const constants_1 = require("./constants");
exports.DEFAULT_CONFIG = {
    mode: 'auto',
    cloudUrl: constants_1.NET.DEFAULT_CLOUD_URL,
    lanUdpPort: constants_1.NET.LAN_UDP_PORT,
    lanTcpPort: constants_1.NET.LAN_TCP_PORT,
    lanDiscoverTimeoutMs: constants_1.NET.LAN_DISCOVER_TIMEOUT_MS,
    roomId: 'shandi-001',
    playerId: '',
    nickname: '玩家',
    handLayout: constants_1.UI.handLayout,
};
function encode(msg) {
    return JSON.stringify(msg);
}
function decode(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
