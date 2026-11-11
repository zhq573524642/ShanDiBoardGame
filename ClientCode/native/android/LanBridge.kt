package com.yiboshi.poker.lan

import android.util.Log
import com.cocos.lib.CocosHelper
import com.cocos.lib.CocosJavascriptJavaBridge
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.io.PrintWriter
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * 近场直连 Android 原生插件（不依赖 GMS / Google Play 服务）。
 *
 * 发现：UDP 广播 "POKER_DISCOVER" → 房主回 "POKER_HOST"
 * 传输：房主开 TCP ServerSocket，各设备一行一条 JSON 消息
 * 回调：CocosJavascriptJavaBridge.evalString 必须在 GL 线程执行
 *
 * Cocos 侧对应类：assets/scripts/net/NativeBridge.ts
 * 集成方式与权限见同目录 README.md
 */
object LanBridge {
    private const val TAG = "LanBridge"
    private const val DISCOVER_REQ = "POKER_DISCOVER"
    private const val DISCOVER_RES = "POKER_HOST"

    private val executor = Executors.newCachedThreadPool()
    private val peerWriters = ConcurrentHashMap<String, PrintWriter>()
    private var serverSocket: ServerSocket? = null
    private var udpSocket: DatagramSocket? = null
    private var clientSocket: Socket? = null
    private var clientWriter: PrintWriter? = null
    private var roomId = ""
    private var tcpPort = 0

    @Volatile
    private var running = false

    /** 房主：同时启动 TCP 服务与 UDP 发现应答 */
    @JvmStatic
    fun startHost(room: String, udpPort: Int, port: Int) {
        stop()
        roomId = room
        tcpPort = port
        running = true
        startTcpServer()
        startUdpResponder(udpPort)
    }

    private fun startTcpServer() {
        executor.execute {
            try {
                serverSocket = ServerSocket(tcpPort).also { it.reuseAddress = true }
                Log.i(TAG, "TCP host listening on $tcpPort")
                while (running) {
                    val socket = serverSocket?.accept() ?: break
                    val peerId = socket.inetAddress.hostAddress + ":" + socket.port
                    val writer = PrintWriter(
                        OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8), true
                    )
                    peerWriters[peerId] = writer
                    executor.execute { readLoop(socket, BufferedReader(InputStreamReader(socket.inputStream, StandardCharsets.UTF_8)), peerId) }
                }
            } catch (e: Exception) {
                if (running) Log.e(TAG, "TCP host failed", e)
            }
        }
    }

    private fun startUdpResponder(udpPort: Int) {
        executor.execute {
            try {
                udpSocket = DatagramSocket(udpPort).also { it.reuseAddress = true; it.broadcast = true }
                val buf = ByteArray(256)
                while (running) {
                    val packet = DatagramPacket(buf, buf.size)
                    udpSocket?.receive(packet)
                    val text = String(packet.data, 0, packet.length, StandardCharsets.UTF_8)
                    if (text == DISCOVER_REQ || text == "$DISCOVER_REQ:$roomId") {
                        val reply = "$DISCOVER_RES:$roomId".toByteArray(StandardCharsets.UTF_8)
                        udpSocket?.send(DatagramPacket(reply, reply.size, packet.address, packet.port))
                    }
                }
            } catch (e: Exception) {
                if (running) Log.e(TAG, "UDP responder failed", e)
            }
        }
    }

    /** 客户端：广播找房主，把找到的 IP 列表回调给 JS */
    @JvmStatic
    fun discover(timeoutMs: Int, udpPort: Int) {
        executor.execute {
            val hosts = JSONArray()
            var socket: DatagramSocket? = null
            try {
                socket = DatagramSocket().also { it.broadcast = true; it.soTimeout = 400 }
                val req = "$DISCOVER_REQ:$roomId".toByteArray(StandardCharsets.UTF_8)
                val probe = DatagramPacket(req, req.size, InetAddress.getByName("255.255.255.255"), udpPort)
                socket.send(probe)
                val deadline = System.currentTimeMillis() + timeoutMs
                val buf = ByteArray(256)
                while (System.currentTimeMillis() < deadline) {
                    try {
                        val packet = DatagramPacket(buf, buf.size)
                        socket.receive(packet)
                        val text = String(packet.data, 0, packet.length, StandardCharsets.UTF_8)
                        if (text.startsWith(DISCOVER_RES)) {
                            hosts.put(packet.address.hostAddress ?: continue)
                        }
                    } catch (e: Exception) {
                        // soTimeout：继续等到总超时
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "discover failed", e)
            } finally {
                socket?.close()
                emitJs("globalThis.__pokerLanOnPeers && globalThis.__pokerLanOnPeers(${q(hosts.toString())})")
            }
        }
    }

    /** 客户端：连上房主 TCP 后回调 JS，JS 才会发 join */
    @JvmStatic
    fun connectTo(host: String, port: Int) {
        tcpPort = port
        executor.execute {
            try {
                val socket = Socket()
                socket.connect(InetSocketAddress(host, port), 3000)
                clientSocket = socket
                running = true
                clientWriter = PrintWriter(
                    OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8), true
                )
                emitJs("globalThis.__pokerLanOnConnected && globalThis.__pokerLanOnConnected()")
                executor.execute {
                    readLoop(socket, BufferedReader(InputStreamReader(socket.inputStream, StandardCharsets.UTF_8)), "host")
                }
            } catch (e: Exception) {
                Log.e(TAG, "connectTo failed", e)
                emitJs("globalThis.__pokerLanOnError && globalThis.__pokerLanOnError(${q("连接房主失败: ${e.message}")})")
            }
        }
    }

    private fun readLoop(socket: Socket, reader: BufferedReader, peerId: String) {
        try {
            while (running) {
                val line = reader.readLine() ?: break
                emitJs("globalThis.__pokerLanOnMessage && globalThis.__pokerLanOnMessage(${q(peerId)}, ${q(line)})")
            }
        } catch (e: Exception) {
            Log.w(TAG, "peer $peerId disconnected: ${e.message}")
        } finally {
            peerWriters.remove(peerId)
            try { socket.close() } catch (_: Exception) {}
            emitJs("globalThis.__pokerLanOnError && globalThis.__pokerLanOnError(${q("peer_lost:$peerId")})")
        }
    }

    /** 客户端发给房主 */
    @JvmStatic
    fun send(json: String) {
        executor.execute {
            val w = clientWriter
            if (w == null || w.checkError()) {
                emitJs("globalThis.__pokerLanOnError && globalThis.__pokerLanOnError(${q("未连接房主")})")
            } else {
                w.println(json)
                w.flush()
            }
        }
    }

    /** 房主定向发给某个 peer */
    @JvmStatic
    fun sendTo(peerId: String, json: String) {
        executor.execute {
            val w = peerWriters[peerId]
            if (w == null || w.checkError()) {
                emitJs("globalThis.__pokerLanOnError && globalThis.__pokerLanOnError(${q("peer_gone:$peerId")})")
            } else {
                w.println(json)
                w.flush()
            }
        }
    }

    @JvmStatic
    fun stop() {
        running = false
        try { serverSocket?.close() } catch (_: Exception) {}
        try { udpSocket?.close() } catch (_: Exception) {}
        try { clientSocket?.close() } catch (_: Exception) {}
        peerWriters.clear()
        serverSocket = null
        udpSocket = null
        clientSocket = null
        clientWriter = null
    }

    /** JSON 字符串字面量转义，避免消息里的引号破坏 evalString */
    private fun q(s: String): String = JSONObject.quote(s) ?: "\"\""

    private fun emitJs(script: String) {
        CocosHelper.runOnGameThread { CocosJavascriptJavaBridge.evalString(script) }
    }
}
