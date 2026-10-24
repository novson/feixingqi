import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AccountError, AccountStore } from '../src/accounts.js'

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'fly-accounts-'))
  const file = join(dir, 'accounts.json')
  const accounts = await new AccountStore(file).load()
  return { accounts, dir }
}

test('创建账号会下发 12 位跨设备登录码', async () => {
  const { accounts, dir } = await tempStore()
  const session = await accounts.create('小明')
  assert.match(session.loginCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  assert.ok(session.accountId && session.accountToken)
  await rm(dir, { recursive: true, force: true })
})

test('用昵称 + 登录码可以在另一台设备登录', async () => {
  const { accounts, dir } = await tempStore()
  const session = await accounts.create('小明')
  const back = await accounts.login('小明', session.loginCode)
  assert.equal(back.accountId, session.accountId)
  // 登录码带不带横杠、大小写都可以
  const loose = await accounts.login('小明', session.loginCode.replace(/-/g, '').toLowerCase())
  assert.equal(loose.accountId, session.accountId)
  await rm(dir, { recursive: true, force: true })
})

test('昵称重复不能重复注册，登录码错误会被拒绝', async () => {
  const { accounts, dir } = await tempStore()
  await accounts.create('小明')
  await assert.rejects(() => accounts.create('小明'), AccountError)
  await assert.rejects(() => accounts.login('小明', 'ABCD-EFGH-IJKL'), AccountError)
  await assert.rejects(() => accounts.login('小红', 'ABCD-EFGH-IJKL'), AccountError)
  await rm(dir, { recursive: true, force: true })
})

test('token 不对时拒绝访问个人资料', async () => {
  const { accounts, dir } = await tempStore()
  const session = await accounts.create('小明')
  await assert.rejects(() => accounts.profile(session.accountId, 'wrong'), AccountError)
  const profile = await accounts.profile(session.accountId, session.accountToken)
  assert.equal(profile.nickname, '小明')
  await rm(dir, { recursive: true, force: true })
})

test('可以换成 4 位数字登录码，换码后旧码失效', async () => {
  const { accounts, dir } = await tempStore()
  const session = await accounts.create('小明')
  const rotated = await accounts.rotateLoginCode(session.accountId, session.accountToken, '2580')
  assert.equal(rotated.loginCode, '2580')
  await accounts.login('小明', '2580')
  await assert.rejects(() => accounts.login('小明', session.loginCode), AccountError)
  await assert.rejects(
    () => accounts.rotateLoginCode(session.accountId, session.accountToken, 'abc'),
    AccountError
  )
  await rm(dir, { recursive: true, force: true })
})

test('战绩会累计到账号并落盘', async () => {
  const { accounts, dir } = await tempStore()
  const session = await accounts.create('小明')
  await accounts.recordResult(session.accountId, {
    roomId: 'r1',
    roomName: '房间',
    mode: 'AI',
    players: 4,
    rank: 1,
    planesHome: 4,
    at: Date.now()
  })
  await accounts.recordResult(session.accountId, {
    roomId: 'r2',
    roomName: '房间2',
    mode: 'AI',
    players: 4,
    rank: 3,
    planesHome: 2,
    at: Date.now() + 1
  })
  const profile = await accounts.profile(session.accountId, session.accountToken)
  assert.equal(profile.games, 2)
  assert.equal(profile.wins, 1)
  assert.equal(profile.winRate, 0.5)
  assert.equal(profile.history.length, 2)
  assert.equal(profile.history[0].roomName, '房间2')

  const reloaded = await new AccountStore(join(dir, 'accounts.json')).load()
  const again = await reloaded.profile(session.accountId, session.accountToken)
  assert.equal(again.games, 2)
  await rm(dir, { recursive: true, force: true })
})
