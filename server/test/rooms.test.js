import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AccountStore } from '../src/accounts.js'
import { GameError } from '../src/game.js'
import { PHASE } from '../src/game.js'
import { RoomManager } from '../src/rooms.js'

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'fly-rooms-'))
  const accounts = await new AccountStore(join(dir, 'accounts.json')).load()
  return { accounts, dir }
}

function fastManager(accounts) {
  return new RoomManager({ accounts, turnSeconds: 0, aiThinkMs: 0, awaySeconds: 0 })
}

test('建房间会生成 4 位房间码，可以用房间码找到房间', async () => {
  const { accounts, dir } = await tempStore()
  const rooms = fastManager(accounts)
  const { game } = rooms.createRoom({ name: '周五约局', hostNickname: '小明', aiPlayers: 1 })
  assert.match(game.code, /^[A-Z0-9]{4}$/)
  assert.equal(rooms.getRoom(game.code).id, game.id)
  assert.equal(rooms.listRooms().length, 1)
  await rm(dir, { recursive: true, force: true })
})

test('AI 补位后可以开局并自动打完整局', async () => {
  const { accounts, dir } = await tempStore()
  const rooms = fastManager(accounts)
  const { game, player } = rooms.createRoom({
    name: 'AI 练习',
    hostNickname: '小明',
    maxPlayers: 2,
    aiPlayers: 1,
    planesPerPlayer: 4
  })
  rooms.startRoom(game.id, player.id, player.reconnectToken)
  assert.equal(game.phase, PHASE.PLAYING)

  let guard = 0
  while (game.phase !== PHASE.FINISHED && guard < 20000) {
    rooms.tick()
    guard += 1
  }
  assert.equal(game.phase, PHASE.FINISHED)
  assert.equal(game.ranking.length, 2)
  game.players.forEach((p) => assert.ok(p.rank >= 1 && p.rank <= 2))
  await rm(dir, { recursive: true, force: true })
})

test('对局结束后把成绩写进账号', async () => {
  const { accounts, dir } = await tempStore()
  const session = await accounts.create('小明')
  const rooms = fastManager(accounts)
  const { game, player } = rooms.createRoom({
    name: '排位局',
    hostNickname: '小明',
    accountId: session.accountId,
    maxPlayers: 2,
    aiPlayers: 1,
    planesPerPlayer: 1 // 缩短对局，测试跑得快
  })
  rooms.startRoom(game.id, player.id, player.reconnectToken)
  let guard = 0
  while (game.phase !== PHASE.FINISHED && guard < 20000) {
    rooms.tick()
    guard += 1
  }
  await new Promise((resolve) => setTimeout(resolve, 50))
  const profile = await accounts.profile(session.accountId, session.accountToken)
  assert.equal(profile.games, 1)
  assert.equal(profile.history[0].mode, 'AI')
  await rm(dir, { recursive: true, force: true })
})

test('只有房主能开局，座位凭证错误会被拒绝', async () => {
  const { accounts, dir } = await tempStore()
  const rooms = fastManager(accounts)
  const { game, player } = rooms.createRoom({ name: '房间', hostNickname: '小明', aiPlayers: 1 })
  const guest = rooms.joinRoom(game.id, { nickname: '小红' })
  assert.throws(() => rooms.startRoom(game.id, guest.player.id, guest.player.reconnectToken), GameError)
  assert.throws(() => rooms.roll(game.id, player.id, 'bad-token'), GameError)
  rooms.startRoom(game.id, player.id, player.reconnectToken)
  assert.equal(game.phase, PHASE.PLAYING)
  await rm(dir, { recursive: true, force: true })
})

test('大厅里离房会释放座位，房主离开后房间仍保留给其他人', async () => {
  const { accounts, dir } = await tempStore()
  const rooms = fastManager(accounts)
  const { game, player } = rooms.createRoom({ name: '房间', hostNickname: '小明', maxPlayers: 4 })
  const guest = rooms.joinRoom(game.id, { nickname: '小红' })
  rooms.leaveRoom(game.id, guest.player.id, guest.player.reconnectToken)
  assert.equal(game.players.length, 1)
  assert.equal(rooms.activeRoom(null), null)
  assert.ok(player.id)
  await rm(dir, { recursive: true, force: true })
})

test('局中离房会交给 AI 托管，不会卡住回合', async () => {
  const { accounts, dir } = await tempStore()
  const rooms = fastManager(accounts)
  const { game, player } = rooms.createRoom({
    name: '房间',
    hostNickname: '小明',
    maxPlayers: 2,
    aiPlayers: 1,
    planesPerPlayer: 1
  })
  rooms.startRoom(game.id, player.id, player.reconnectToken)
  rooms.leaveRoom(game.id, player.id, player.reconnectToken)
  assert.equal(game.players[0].ai, true)
  let guard = 0
  while (game.phase !== PHASE.FINISHED && guard < 20000) {
    rooms.tick()
    guard += 1
  }
  assert.equal(game.phase, PHASE.FINISHED)
  await rm(dir, { recursive: true, force: true })
})

test('账号可以查到自己还在的房间', async () => {
  const { accounts, dir } = await tempStore()
  const session = await accounts.create('小明')
  const rooms = fastManager(accounts)
  const { game } = rooms.createRoom({ name: '房间', hostNickname: '小明', accountId: session.accountId, aiPlayers: 1 })
  const active = rooms.activeRoom(session.accountId)
  assert.equal(active.roomId, game.id)
  rooms.leaveRoom(game.id, active.playerId, active.reconnectToken)
  assert.equal(rooms.activeRoom(session.accountId), null)
  await rm(dir, { recursive: true, force: true })
})
