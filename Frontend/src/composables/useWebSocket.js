import { ref, onBeforeUnmount } from 'vue'

/**
 * Thin WebSocket wrapper for talking to Node-RED.
 *
 * Message contract (both directions):
 *   { type: 'telemetry' | 'alarm' | 'io.list' | 'io.add' | 'io.remove' |
 *           'test.step' | 'test.log' | 'test.status' | 'storage.stats' | 'cmd',
 *     payload: <any>,
 *     ts: <epoch ms> }
 *
 * Usage:
 *   const { status, send } = useWebSocket(url, (msg) => rigStore.handleMessage(msg))
 */
export function useWebSocket(url, onMessage) {
  const status = ref('connecting') // 'connecting' | 'connected' | 'disconnected'
  let socket = null
  let reconnectAttempt = 0
  let reconnectTimer = null
  let heartbeatTimer = null
  let manuallyClosed = false

  const MAX_BACKOFF_MS = 10_000
  const HEARTBEAT_MS = 15_000

  function backoffDelay() {
    // exponential backoff capped at MAX_BACKOFF_MS, small jitter to avoid thundering herd
    const base = Math.min(1000 * 2 ** reconnectAttempt, MAX_BACKOFF_MS)
    return base + Math.random() * 300
  }

  function connect() {
    manuallyClosed = false
    status.value = reconnectAttempt === 0 ? 'connecting' : 'connecting'
    socket = new WebSocket(url)

    socket.addEventListener('open', () => {
      status.value = 'connected'
      reconnectAttempt = 0
      startHeartbeat()
      console.log(
        '%c[WS] Connected to Node-RED %c' + url,
        'background:#16a34a;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px',
        'color:#16a34a;font-weight:normal'
      )
    })

    socket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data)
        onMessage?.(msg)
      } catch (err) {
        console.error('[ws] malformed message', err, event.data)
      }
    })

    socket.addEventListener('close', () => {
      status.value = 'disconnected'
      stopHeartbeat()
      if (!manuallyClosed) {
        console.warn(
          '%c[WS] Disconnected — will retry in ~' + Math.round(backoffDelay() / 1000) + 's',
          'color:#b45309;font-weight:bold'
        )
        scheduleReconnect()
      } else {
        console.log('%c[WS] Closed (manual)', 'color:#6b7280')
      }
    })

    socket.addEventListener('error', () => {
      // 'close' fires right after 'error' on native WebSocket — let close() handle reconnect
      socket?.close()
    })
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      reconnectAttempt += 1
      connect()
    }, backoffDelay())
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      send({ type: 'ping', payload: null, ts: Date.now() })
    }, HEARTBEAT_MS)
  }
  function stopHeartbeat() {
    clearInterval(heartbeatTimer)
  }

  function send(message) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message))
      return true
    }
    // TODO: for commands that must not be lost (e.g. actuator writes),
    // queue here and flush on reconnect instead of silently dropping.
    console.warn('[ws] send skipped — socket not open', message)
    return false
  }

  function close() {
    manuallyClosed = true
    clearTimeout(reconnectTimer)
    stopHeartbeat()
    socket?.close()
  }

  connect()
  onBeforeUnmount(close)

  return { status, send, close, reconnectNow: () => { reconnectAttempt = 0; close(); connect() } }
}
