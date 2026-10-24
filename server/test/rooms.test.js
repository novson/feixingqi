import assert from 'node:assert/strict'
import test from 'node:test'
import { GameError, PHASE } from '../src/game.js'
import { RoomManager } from '../src/rooms.js'

function fastManager() {
  return new RoomManager({ turnSeconds: 0, aiThinkMs: 0, awaySeconds: 0 })
}

test('建房间会生成 4 位房间码，可以用房间码找到房间', () => {
  const rooms = fastManager()
  const { game } = rooms.createRoom({ name: '周五约局', hostNickname: '小明', aiPlayers: 1 })
  assert.match(game.code, /^[A-Z0-9]{4}$/)
  assert.equal(rooms.getRoom(game.code).id, game.id)
  assert.equal(rooms.listRooms().length, 1)
})

test('AI 补位后可以开局并自动打完整局', () => {
  const rooms = fastManager()
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
  game.players.forEach((seat) => assert.ok(seat.rank >= 1 && seat.rank <= 2))
})

test('只有房主能开局，座位凭证错误会被拒绝', () => {
  const rooms = fastManager()
  const { game, player } = rooms.createRoom({ name: '房间', hostNickname: '小明', aiPlayers: 1 })
  const guest = rooms.joinRoom(game.id, { nickname: '小红' })
  assert.throws(() => rooms.startRoom(game.id, guest.player.id, guest.player.reconnectToken), GameError)
  assert.throws(() => rooms.roll(game.id, player.id, 'bad-token'), GameError)
  rooms.startRoom(game.id, player.id, player.reconnectToken)
  assert.equal(game.phase, PHASE.PLAYING)
})

test('大厅里离房会释放座位，房间还在', () => {
  const rooms = fastManager()
  const { game, player } = rooms.createRoom({ name: '房间', hostNickname: '小明', maxPlayers: 4 })
  const guest = rooms.joinRoom(game.id, { nickname: '小红' })
  rooms.leaveRoom(game.id, guest.player.id, guest.player.reconnectToken)
  assert.equal(game.players.length, 1)
  assert.ok(player.id)
})

test('局中离房会交给 AI 托管，不会卡住回合', () => {
  const rooms = fastManager()
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
})

test('刷新页面后可以用 playerId + reconnectToken 回到座位', () => {
  const rooms = fastManager()
  const { game, player } = rooms.createRoom({ name: '房间', hostNickname: '小明', aiPlayers: 1 })
  const found = rooms.findSeat(game.id, player.id, player.reconnectToken)
  assert.equal(found.player.id, player.id)
  assert.equal(rooms.findSeat(game.id, player.id, 'wrong-token'), null)
})

test('昵称长度会被校验', () => {
  const rooms = fastManager()
  const tooLong = '这是一个非常非常长的昵称肯定超过十六个字了'
  assert.ok(tooLong.length > 16)
  assert.throws(() => rooms.createRoom({ name: '房间', hostNickname: tooLong }), GameError)
  assert.throws(() => rooms.createRoom({ name: '房间', hostNickname: '  ' }), GameError)
})
