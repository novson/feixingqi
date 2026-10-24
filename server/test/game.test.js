import assert from 'node:assert/strict'
import test from 'node:test'
import { Game, GameError, PHASE, TURN_STATE } from '../src/game.js'
import { FINISH, HANGAR } from '../src/rules.js'

function sequenceRng(values) {
  const queue = [...values]
  return () => (queue.length > 1 ? queue.shift() : queue[0])
}

function fourPlayerGame(values) {
  const game = new Game({ name: '测试局', maxPlayers: 4, planesPerPlayer: 4, rng: sequenceRng(values) })
  game.addPlayer({ nickname: '小红' })
  game.addPlayer({ nickname: '小橙' })
  game.addPlayer({ nickname: '小黄' })
  game.addPlayer({ nickname: '小绿' })
  game.start()
  return game
}

test('开局后所有飞机都在机库，轮到 0 号位', () => {
  const game = fourPlayerGame([3])
  assert.equal(game.phase, PHASE.PLAYING)
  assert.equal(game.turnSeat, 0)
  assert.equal(game.turnState, TURN_STATE.ROLL)
  game.players.forEach((player) => player.planes.forEach((plane) => assert.equal(plane, HANGAR)))
})

test('不是 6 点时没有棋子能动', () => {
  const game = fourPlayerGame([3])
  assert.deepEqual(game.legalPlanes(0, 3), [])
})

test('掷 6 起飞，起飞点是同色格所以立刻跳 4 格', () => {
  const game = fourPlayerGame([6, 2])
  game.roll(game.players[0].id, 0)
  assert.equal(game.die, 6)
  assert.equal(game.legal.length, 4)
  game.move(game.players[0].id, 0, 0)
  assert.equal(game.players[0].planes[0], 4)
  assert.equal(game.turnSeat, 0, '掷出 6 点后仍是自己的回合')
  assert.equal(game.turnState, TURN_STATE.ROLL)
})

test('非 6 点后轮到下一位', () => {
  const game = fourPlayerGame([6, 2])
  game.roll(game.players[0].id, 0)
  game.move(game.players[0].id, 0, 0)
  game.roll(game.players[0].id, 0)
  assert.equal(game.turnSeat, 1)
})

test('撞子把对方飞机送回机库', () => {
  const game = fourPlayerGame([4])
  game.players[0].planes[0] = 10 // 10 + 4 = 14，正好是 1 号玩家的起飞点
  game.players[0].planes[1] = 20 // 多一个合法走法，避免自动落子
  game.players[1].planes[0] = 0
  game.roll(game.players[0].id, 0)
  const preview = game.move(game.players[0].id, 0, 0)
  assert.equal(preview.to, 14)
  assert.equal(preview.crashed.length, 1)
  assert.equal(game.players[1].planes[0], HANGAR)
})

test('终点需要精确点数，超出不允许移动', () => {
  const game = fourPlayerGame([4])
  game.players[0].planes[0] = FINISH - 2 // 差 2 格，掷 4 会超出
  game.players[0].planes[1] = FINISH - 8
  game.players[0].planes[2] = 30
  assert.deepEqual(
    game.legalPlanes(0, 4).map((move) => move.plane),
    [1, 2]
  )
})

test('最后一架飞机到家即夺冠并结束对局', () => {
  const game = new Game({ maxPlayers: 2, planesPerPlayer: 1, rng: sequenceRng([2]) })
  game.addPlayer({ nickname: 'A' })
  game.addPlayer({ nickname: 'B' })
  game.start()
  game.players[0].planes[0] = FINISH - 2
  game.roll(game.players[0].id, 0)
  assert.equal(game.players[0].planes[0], FINISH)
  assert.equal(game.players[0].rank, 1)
  assert.equal(game.phase, PHASE.FINISHED)
})

test('非当前回合玩家操作会被拒绝', () => {
  const game = fourPlayerGame([6])
  assert.throws(() => game.roll(game.players[1].id, 0), GameError)
})

test('局中不能加入新玩家', () => {
  const game = fourPlayerGame([6])
  assert.throws(() => game.addPlayer({ nickname: '小蓝' }), GameError)
})

test('连续 6 点最多三次，之后交出行动权', () => {
  const game = new Game({ maxPlayers: 2, planesPerPlayer: 2, rng: sequenceRng([6]) })
  game.addPlayer({ nickname: 'A' })
  game.addPlayer({ nickname: 'B' })
  game.start()
  for (let round = 0; round < 3; round += 1) {
    game.roll(game.players[0].id, 0)
    if (game.turnState === TURN_STATE.MOVE) game.move(game.players[0].id, 0, 0)
  }
  assert.equal(game.turnSeat, 1)
  assert.equal(game.players[0].stats.rolls, 3)
})

test('快照包含所有玩家与棋盘状态', () => {
  const game = fourPlayerGame([6])
  const snapshot = game.snapshot()
  assert.equal(snapshot.players.length, 4)
  assert.deepEqual(
    snapshot.players.map((player) => player.color),
    ['red', 'blue', 'yellow', 'green']
  )
  assert.equal(snapshot.seatCount, 4)
  assert.equal(snapshot.planesPerPlayer, 4)
})
