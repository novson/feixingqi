const SESSION_KEY = 'feixingqi.session'

function valid(value) {
  return (
    value &&
    typeof value.roomId === 'string' &&
    typeof value.playerId === 'string' &&
    typeof value.reconnectToken === 'string'
  )
}

export function readSession(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null')
    return valid(value) ? value : null
  } catch {
    return null
  }
}

export function saveSession(session, storage = localStorage) {
  const value = {
    roomId: session.roomId,
    playerId: session.playerId,
    reconnectToken: session.reconnectToken,
    roomName: session.roomName || '',
    nickname: session.nickname || '',
    autoResume: session.autoResume !== false
  }
  storage.setItem(SESSION_KEY, JSON.stringify(value))
  return value
}

export function clearSession(storage = localStorage) {
  storage.removeItem(SESSION_KEY)
}
