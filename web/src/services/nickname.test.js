import { describe, expect, it } from 'vitest'
import { clearNickname, readNickname, saveNickname } from './nickname.js'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  }
}

describe('昵称本地存储', () => {
  it('保存后可读回，换昵称后清空', () => {
    const storage = memoryStorage()
    expect(readNickname(storage)).toBeNull()
    saveNickname('  小明  ', storage)
    expect(readNickname(storage)).toBe('小明')
    clearNickname(storage)
    expect(readNickname(storage)).toBeNull()
  })

  it('超长昵称会被截断到 16 个字', () => {
    const storage = memoryStorage()
    saveNickname('这是一个非常非常长的昵称肯定超过十六个字了', storage)
    expect(readNickname(storage).length).toBe(16)
  })
})
