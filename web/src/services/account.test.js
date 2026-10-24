import { describe, expect, it } from 'vitest'
import { clearAccount, normalizeLoginCodeInput, readAccount, saveAccount } from './account.js'
import { clearSession, readSession, saveSession } from './session.js'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  }
}

describe('账号本地存储', () => {
  it('保存后可以读回，退出后清空', () => {
    const storage = memoryStorage()
    saveAccount({ accountId: 'a1', accountToken: 't1', loginCode: 'ABCD-EFGH-IJKL', profile: { nickname: '小明' } }, storage)
    const account = readAccount(storage)
    expect(account.accountId).toBe('a1')
    expect(account.nickname).toBe('小明')
    clearAccount(storage)
    expect(readAccount(storage)).toBeNull()
  })

  it('残缺数据视为未登录', () => {
    const storage = memoryStorage()
    storage.setItem('feixingqi.account', JSON.stringify({ accountId: 'a1' }))
    expect(readAccount(storage)).toBeNull()
  })
})

describe('登录码归一化', () => {
  it('接受 4 位数字与 12 位字母数字', () => {
    expect(normalizeLoginCodeInput('2580')).toEqual({ code: '2580', valid: true })
    expect(normalizeLoginCodeInput('abcd-efgh-ijkl')).toEqual({ code: 'ABCDEFGHIJKL', valid: true })
    expect(normalizeLoginCodeInput('')).toEqual({ code: '', valid: false })
    expect(normalizeLoginCodeInput('12345')).toEqual({ code: '12345', valid: false })
  })
})

describe('房间会话', () => {
  it('保存后可以读回，离开后清空', () => {
    const storage = memoryStorage()
    saveSession({ roomId: 'r1', playerId: 'p1', reconnectToken: 'k1', roomName: '周五约局' }, storage)
    expect(readSession(storage).roomId).toBe('r1')
    clearSession(storage)
    expect(readSession(storage)).toBeNull()
  })
})
