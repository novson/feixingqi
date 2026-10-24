import { createHash, randomUUID } from 'node:crypto'
import { readJson, writeJsonAtomic } from './store.js'

/**
 * 无密码账号体系（沿用 poker-game 的做法）：
 * 昵称 + 跨设备登录码登录，服务端只保存登录码的 SHA-256；
 * 登录后下发 accountId + accountToken，客户端存 localStorage，
 * 后续请求用 X-Account-Token 头携带 accountToken。
 */

const LOGIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const HISTORY_LIMIT = 50
const CUSTOM_SHORT = /^\d{4}$/
const CUSTOM_LONG = /^[A-Z0-9]{12}$/

export class AccountStore {
  constructor(file) {
    this.file = file
    this.accounts = new Map()
  }

  async load() {
    const snapshot = await readJson(this.file, null)
    const list = Array.isArray(snapshot?.accounts) ? snapshot.accounts : []
    list.forEach((account) => this.accounts.set(account.id, normalize(account)))
    return this
  }

  async create(rawNickname) {
    const nickname = normalizeNickname(rawNickname)
    if (this.findByNickname(nickname))
      throw new AccountError('该昵称已绑定账号，请使用跨设备登录码登录')
    const now = Date.now()
    const loginCode = generateLoginCode()
    const account = {
      id: randomUUID(),
      token: randomUUID(),
      nickname,
      loginCodeHash: hashLoginCode(loginCode),
      createdAt: now,
      lastSeenAt: now,
      games: 0,
      wins: 0,
      history: []
    }
    this.accounts.set(account.id, account)
    await this.persist()
    return this.session(account, loginCode)
  }

  async login(rawNickname, rawLoginCode) {
    const nickname = normalizeNickname(rawNickname)
    const loginCode = normalizeLoginCode(rawLoginCode)
    const account = this.findByNickname(nickname)
    if (!account || !safeEqual(account.loginCodeHash, hashLoginCode(loginCode)))
      throw new AccountError('账号或跨设备登录码不正确')
    account.lastSeenAt = Date.now()
    await this.persist()
    return this.session(account, formatLoginCode(loginCode))
  }

  async profile(accountId, token) {
    const account = this.authenticate(accountId, token)
    account.lastSeenAt = Date.now()
    return {
      id: account.id,
      nickname: account.nickname,
      createdAt: account.createdAt,
      lastSeenAt: account.lastSeenAt,
      games: account.games,
      wins: account.wins,
      winRate: account.games === 0 ? 0 : account.wins / account.games,
      history: account.history.slice(-HISTORY_LIMIT).reverse()
    }
  }

  async identity(accountId, token) {
    const account = this.authenticate(accountId, token)
    return { id: account.id, nickname: account.nickname, games: account.games, wins: account.wins }
  }

  /** 更换跨设备登录码；不传 loginCode 时随机生成。 */
  async rotateLoginCode(accountId, token, requestedCode) {
    const account = this.authenticate(accountId, token)
    const loginCode =
      requestedCode == null || String(requestedCode).trim() === ''
        ? generateLoginCode()
        : requireCustomLoginCode(requestedCode)
    const hash = hashLoginCode(loginCode)
    const clash = [...this.accounts.values()].some(
      (other) => other.id !== account.id && other.loginCodeHash === hash
    )
    if (clash) throw new AccountError('该跨设备登录码已被其他账号使用')
    account.loginCodeHash = hash
    account.lastSeenAt = Date.now()
    await this.persist()
    return { loginCode: formatLoginCode(loginCode) }
  }

  /** 记录一局成绩。rank 为 1 表示夺冠。 */
  async recordResult(accountId, result) {
    if (!accountId) return
    const account = this.accounts.get(accountId)
    if (!account) return
    if (account.history.some((entry) => entry.roomId === result.roomId && entry.at === result.at))
      return
    account.games += 1
    if (result.rank === 1) account.wins += 1
    account.lastSeenAt = Date.now()
    account.history.push({
      id: randomUUID(),
      at: result.at || Date.now(),
      roomId: result.roomId,
      roomName: result.roomName,
      mode: result.mode || 'HUMAN',
      players: result.players,
      rank: result.rank,
      planesHome: result.planesHome || 0
    })
    if (account.history.length > HISTORY_LIMIT)
      account.history.splice(0, account.history.length - HISTORY_LIMIT)
    await this.persist()
  }

  async list() {
    return [...this.accounts.values()].map((account) => ({
      id: account.id,
      nickname: account.nickname,
      games: account.games,
      wins: account.wins,
      createdAt: account.createdAt,
      lastSeenAt: account.lastSeenAt
    }))
  }

  session(account, loginCode) {
    return {
      accountId: account.id,
      accountToken: account.token,
      loginCode: formatLoginCode(loginCode),
      profile: {
        id: account.id,
        nickname: account.nickname,
        games: account.games,
        wins: account.wins,
        createdAt: account.createdAt
      }
    }
  }

  authenticate(accountId, token) {
    const account = this.accounts.get(accountId)
    if (!account) throw new AccountError('账号不存在')
    if (!token || account.token !== token) throw new AccountError('账号身份已失效，请使用原浏览器继续')
    return account
  }

  findByNickname(nickname) {
    const lower = nickname.trim().toLowerCase()
    return [...this.accounts.values()].find((account) => account.nickname.toLowerCase() === lower) || null
  }

  async persist() {
    if (!this.file) return
    await writeJsonAtomic(this.file, { version: 1, accounts: [...this.accounts.values()] })
  }
}

function normalize(account) {
  return {
    id: account.id,
    token: account.token,
    nickname: account.nickname,
    loginCodeHash: account.loginCodeHash,
    createdAt: account.createdAt || Date.now(),
    lastSeenAt: account.lastSeenAt || Date.now(),
    games: account.games || 0,
    wins: account.wins || 0,
    history: Array.isArray(account.history) ? account.history : []
  }
}

function normalizeNickname(raw) {
  const nickname = String(raw || '').trim()
  if (nickname.length < 1 || nickname.length > 16) throw new AccountError('昵称需要 1–16 个字符')
  return nickname
}

function normalizeLoginCode(raw) {
  const code = String(raw || '')
    .replace(/[-\s]/g, '')
    .toUpperCase()
  if (code === '') throw new AccountError('请输入跨设备登录码')
  return code
}

function requireCustomLoginCode(raw) {
  const code = normalizeLoginCode(raw)
  if (CUSTOM_SHORT.test(code) || CUSTOM_LONG.test(code)) return code
  throw new AccountError('跨设备登录码需要 4 位数字或 12 位字母数字组合')
}

export function formatLoginCode(code) {
  const flat = String(code).replace(/[-\s]/g, '')
  if (flat.length !== 12) return flat
  return `${flat.slice(0, 4)}-${flat.slice(4, 8)}-${flat.slice(8, 12)}`
}

function generateLoginCode() {
  let raw = ''
  for (let index = 0; index < 12; index += 1)
    raw += LOGIN_CODE_ALPHABET[Math.floor(Math.random() * LOGIN_CODE_ALPHABET.length)]
  return raw
}

function hashLoginCode(code) {
  return createHash('sha256').update(normalizeLoginCode(code)).digest('base64')
}

function safeEqual(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false
  const a = Buffer.from(expected)
  const b = Buffer.from(actual)
  return a.length === b.length && a.equals(b)
}

export class AccountError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AccountError'
    this.expose = true
  }
}
