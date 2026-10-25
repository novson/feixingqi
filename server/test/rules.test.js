import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FINISH,
  TRACK,
  absoluteCell,
  airportCell,
  cellColor,
  jumpDistanceFor,
  resolveLanding,
  startCell
} from '../src/rules.js'

test('4 人局起飞点均匀分布在四个角', () => {
  assert.deepEqual(
    [0, 1, 2, 3].map((seat) => startCell(seat, 4)),
    [0, 14, 28, 42]
  )
})

test('8 人局起飞点间隔 7 格', () => {
  const starts = Array.from({ length: 8 }, (_, seat) => startCell(seat, 8))
  assert.deepEqual(starts, [0, 7, 14, 21, 28, 35, 42, 49])
})

test('起飞点互不重叠且都在棋盘内', () => {
  for (let players = 2; players <= 8; players += 1) {
    const starts = Array.from({ length: players }, (_, seat) => startCell(seat, players))
    assert.equal(new Set(starts).size, players, `${players} 人局起飞点应互不相同`)
    starts.forEach((cell) => assert.ok(cell >= 0 && cell < TRACK))
  }
})

test('跳棋距离等于玩家数，落点仍是同色格', () => {
  // 56 能被 2/4/7/8 整除，这些人数下棋盘颜色是完美循环
  for (const players of [2, 4, 7, 8]) {
    const jump = jumpDistanceFor(players, 'AUTO')
    for (let cell = 0; cell < TRACK; cell += 1)
      assert.equal(cellColor((cell + jump) % TRACK, players), cellColor(cell, players))
  }
  assert.equal(jumpDistanceFor(4, 'CLASSIC4'), 4)
  assert.equal(jumpDistanceFor(8, 'CLASSIC4'), 4)
})

test('每位玩家的跳棋点数量基本一致', () => {
  for (let players = 2; players <= 8; players += 1) {
    const counts = Array.from({ length: players }, (_, seat) =>
      Array.from({ length: TRACK }, (_, cell) => cell).filter((cell) => cellColor(cell, players) === seat).length
    )
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${players} 人局跳棋点分布不均：${counts}`)
  }
})

test('落在同色格触发一次跳棋，不会连锁', () => {
  // 0 号玩家（4 人局）起飞点是 0，位置 4 的绝对格颜色为 0，应跳到 8 后停止
  assert.equal(cellColor(absoluteCell(0, 4, 4), 4), 0)
  const landing = resolveLanding(0, 4, 4, {})
  assert.equal(landing.position, 8)
  assert.deepEqual(landing.effects, ['JUMP'])
})

test('不同色格不触发跳棋', () => {
  const landing = resolveLanding(0, 5, 4, {})
  assert.equal(landing.position, 5)
  assert.deepEqual(landing.effects, [])
})

test('落在飞机场触发飞棋（飞到对面）并再前进一个同色间距', () => {
  const airport = airportCell(0, 4)
  assert.equal(airport, 7)
  const landing = resolveLanding(0, 7, 4, {})
  assert.equal(landing.position, 7 + 14 + 4)
  assert.deepEqual(landing.effects, ['FLY', 'JUMP'])
})

test('关闭飞棋后飞机场只是普通格子', () => {
  const landing = resolveLanding(0, 7, 4, { flyEnabled: false })
  assert.equal(landing.position, 7)
  assert.deepEqual(landing.effects, [])
})

test('跳棋不会越过大本营', () => {
  const landing = resolveLanding(0, TRACK - 1, 4, {})
  assert.ok(landing.position <= FINISH)
})

test('8 人局飞机场正好在对面玩家一侧', () => {
  assert.equal(airportCell(0, 8), 3)
  assert.equal(airportCell(4, 8), 31)
  assert.equal((airportCell(0, 8) + TRACK / 2) % TRACK, airportCell(4, 8))
})
