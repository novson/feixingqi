/**
 * 房间实时通道：订阅房间后接收整份状态快照，
 * 断线自动重连（退避重试），恢复后重新订阅并上报在线状态。
 */
export function connectRoom({ roomId, playerId = null, reconnectToken = null, onState, onStatus }) {
  let socket = null
  let closed = false
  let attempts = 0
  let timer = null

  const protocol = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = typeof location !== 'undefined' ? location.host : 'localhost:8080'
  const base = import.meta.env.BASE_URL || '/'

  function open() {
    if (closed) return
    onStatus?.('connecting')
    socket = new WebSocket(`${protocol}//${host}${base}ws`)
    socket.addEventListener('open', () => {
      attempts = 0
      onStatus?.('online')
      socket.send(JSON.stringify({ t: 'sub', roomId }))
      if (playerId && reconnectToken)
        socket.send(JSON.stringify({ t: 'presence', roomId, playerId, reconnectToken, connected: true }))
    })
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.t === 'state') onState?.(message.room)
      } catch {
        /* 忽略无法解析的消息 */
      }
    })
    socket.addEventListener('close', () => {
      if (closed) return
      onStatus?.('offline')
      attempts += 1
      const delay = Math.min(8000, 400 * 2 ** Math.min(attempts, 5))
      timer = setTimeout(open, delay)
    })
    socket.addEventListener('error', () => socket?.close())
  }

  open()

  return {
    presence(connected) {
      if (socket?.readyState === WebSocket.OPEN && playerId && reconnectToken)
        socket.send(JSON.stringify({ t: 'presence', roomId, playerId, reconnectToken, connected }))
    },
    close() {
      closed = true
      clearTimeout(timer)
      if (socket?.readyState === WebSocket.OPEN && playerId && reconnectToken)
        socket.send(JSON.stringify({ t: 'presence', roomId, playerId, reconnectToken, connected: false }))
      socket?.close()
    }
  }
}
