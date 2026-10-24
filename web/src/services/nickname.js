// 昵称：不用注册登录，填个昵称就能进房间，存在浏览器本地下次自动带上。
const NICKNAME_KEY = 'feixingqi.nickname'

export function readNickname(storage = localStorage) {
  try {
    const value = (storage.getItem(NICKNAME_KEY) || '').trim()
    return value ? value.slice(0, 16) : null
  } catch {
    return null
  }
}

export function saveNickname(nickname, storage = localStorage) {
  const value = String(nickname || '').trim().slice(0, 16)
  storage.setItem(NICKNAME_KEY, value)
  return value
}

export function clearNickname(storage = localStorage) {
  storage.removeItem(NICKNAME_KEY)
}
