const ACCOUNT_KEY = 'feixingqi.account'

export function readAccount(storage = localStorage) {
  try {
    const account = JSON.parse(storage.getItem(ACCOUNT_KEY) || 'null')
    if (!account?.accountId || !account?.accountToken) return null
    return account
  } catch {
    return null
  }
}

export function saveAccount(account, storage = localStorage) {
  const saved = {
    accountId: account.accountId,
    accountToken: account.accountToken,
    loginCode: account.loginCode || '',
    nickname: account.profile?.nickname || account.nickname || ''
  }
  storage.setItem(ACCOUNT_KEY, JSON.stringify(saved))
  return saved
}

export function clearAccount(storage = localStorage) {
  storage.removeItem(ACCOUNT_KEY)
}

/** 登录码输入归一化：4 位数字或 12 位字母数字组合。 */
export function normalizeLoginCodeInput(raw) {
  const code = String(raw ?? '').replace(/[-\s]/g, '').toUpperCase()
  return { code, valid: /^\d{4}$/.test(code) || /^[A-Z0-9]{12}$/.test(code) }
}
