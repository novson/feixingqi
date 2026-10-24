import { describe, expect, it } from 'vitest'
import { CENTER, CELL, MARGIN, SPAN, cellCenter, hangarSlots, homeLaneSlots, homeSlot, outwardNormal } from './board.js'
import { TRACK } from './rules.js'

describe('外圈格子', () => {
  it('每边 14 格，四个角落在正方形角上', () => {
    const topLeft = cellCenter(0)
    const topRight = cellCenter(14)
    const bottomRight = cellCenter(28)
    const bottomLeft = cellCenter(42)
    expect(topRight.x).toBeGreaterThan(topLeft.x)
    expect(topLeft.y).toBeCloseTo(topRight.y, 5)
    expect(bottomRight.y).toBeGreaterThan(topRight.y)
    expect(bottomLeft.x).toBeCloseTo(topLeft.x, 5)
  })

  it('格子间距等于边长 / 14', () => {
    const a = cellCenter(0)
    const b = cellCenter(1)
    expect(Math.abs(b.x - a.x)).toBeCloseTo(CELL, 5)
    expect(SPAN).toBeCloseTo(CELL * 14, 5)
  })

  it('所有格子都落在棋盘范围内', () => {
    for (let index = 0; index < TRACK; index += 1) {
      const point = cellCenter(index)
      expect(point.x).toBeGreaterThanOrEqual(MARGIN - 1)
      expect(point.x).toBeLessThanOrEqual(MARGIN + SPAN + 1)
      expect(point.y).toBeGreaterThanOrEqual(MARGIN - 1)
      expect(point.y).toBeLessThanOrEqual(MARGIN + SPAN + 1)
    }
  })
})

describe('机库与终点', () => {
  it('机库在棋盘外侧', () => {
    for (let seat = 0; seat < 8; seat += 1) {
      const { pad } = hangarSlots(seat, 8, 4)
      const distance = Math.hypot(pad.x - CENTER, pad.y - CENTER)
      expect(distance).toBeGreaterThan(SPAN / 2)
    }
  })

  it('机库机位数量等于每人飞机数', () => {
    expect(hangarSlots(0, 4, 2).slots).toHaveLength(2)
    expect(hangarSlots(0, 4, 4).slots).toHaveLength(4)
  })

  it('终点通道 6 格，逐渐靠近中心', () => {
    const slots = homeLaneSlots(0, 4)
    expect(slots).toHaveLength(6)
    const distances = slots.map((slot) => Math.hypot(slot.x - CENTER, slot.y - CENTER))
    for (let index = 1; index < distances.length; index += 1)
      expect(distances[index]).toBeLessThan(distances[index - 1])
  })

  it('到家的飞机落在中心区域内', () => {
    for (let seat = 0; seat < 6; seat += 1) {
      const slot = homeSlot(seat, 6, 0)
      expect(Math.hypot(slot.x - CENTER, slot.y - CENTER)).toBeLessThan(48)
    }
  })

  it('外法线长度为 1', () => {
    const normal = outwardNormal(7)
    expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1, 6)
  })
})
