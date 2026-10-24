// 部署在子路径下（如 /feixingqi/）时 BASE_URL 由 Vite 注入，本地开发为 '/'
const BASE = `${import.meta.env.BASE_URL || '/'}api`

async function request(path, { method = 'GET', body = undefined, token = null } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['X-Account-Token'] = token
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (response.status === 204) return null
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(data?.error || `请求失败（${response.status}）`)
  return data
}

export const api = {
  health: () => request('/health'),

  createAccount: (nickname) => request('/accounts', { method: 'POST', body: { nickname } }),
  login: (nickname, loginCode) => request('/accounts/login', { method: 'POST', body: { nickname, loginCode } }),
  profile: (accountId, token) => request(`/accounts/${accountId}`, { token }),
  rotateLoginCode: (accountId, token, loginCode) =>
    request(`/accounts/${accountId}/login-code`, { method: 'POST', body: { loginCode }, token }),
  activeRoom: (accountId, token) => request(`/accounts/${accountId}/active-room`, { token }),

  listRooms: () => request('/rooms'),
  createRoom: (payload) => request('/rooms', { method: 'POST', body: payload }),
  getRoom: (roomId) => request(`/rooms/${roomId}`),
  joinRoom: (roomId, payload) => request(`/rooms/${roomId}/join`, { method: 'POST', body: payload }),
  setAi: (roomId, payload) => request(`/rooms/${roomId}/ai`, { method: 'POST', body: payload }),
  start: (roomId, payload) => request(`/rooms/${roomId}/start`, { method: 'POST', body: payload }),
  roll: (roomId, payload) => request(`/rooms/${roomId}/roll`, { method: 'POST', body: payload }),
  move: (roomId, payload) => request(`/rooms/${roomId}/move`, { method: 'POST', body: payload }),
  leave: (roomId, payload) => request(`/rooms/${roomId}/leave`, { method: 'POST', body: payload }),
  resume: (roomId, payload) => request(`/rooms/${roomId}/resume`, { method: 'POST', body: payload })
}

export function seatCommand(playerId, reconnectToken, extra = {}) {
  return { playerId, reconnectToken, ...extra }
}
