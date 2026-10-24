/**
 * 极简 WebSocket 广播中心：客户端连接后订阅某个房间，
 * 房间状态每次变化都会把完整快照推给所有订阅者（飞行棋没有隐藏信息）。
 */
export function createHub() {
  const subscribers = new Map()

  function subscribe(roomId, socket) {
    if (!subscribers.has(roomId)) subscribers.set(roomId, new Set())
    subscribers.get(roomId).add(socket)
  }

  function unsubscribe(roomId, socket) {
    const sockets = subscribers.get(roomId)
    if (!sockets) return
    sockets.delete(socket)
    if (sockets.size === 0) subscribers.delete(roomId)
  }

  function unsubscribeAll(socket) {
    subscribers.forEach((sockets, roomId) => {
      sockets.delete(socket)
      if (sockets.size === 0) subscribers.delete(roomId)
    })
  }

  function broadcast(roomId, snapshot) {
    const sockets = subscribers.get(roomId)
    if (!sockets || sockets.size === 0) return
    const payload = JSON.stringify({ t: 'state', room: snapshot })
    sockets.forEach((socket) => {
      if (socket.readyState === 1) socket.send(payload)
    })
  }

  function count(roomId) {
    return subscribers.get(roomId)?.size || 0
  }

  return { subscribe, unsubscribe, unsubscribeAll, broadcast, count }
}
