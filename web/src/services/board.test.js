import { describe, expect, it } from 'vitest'
import {
  CENTER,
  CELL,
  GOAL_RADIUS,
  MARGIN,
  RING,
  VIEW,
  airportLines,
  cellCenter,
  goalWedges,
  hangarInfo,
  homeLaneSlots,
  homeSlot
} from './board.js'
import { TRACK, startCell } from './rules.js'

describe('十字轨道', () => {
  it('共 56 格且互不重复', () => {
    expect(RING).toHaveLength(TRACK)
    const keys = new Set(RING.map((point) => `${point.x}:${point.y}`))
    expect(keys.size).toBe(TRACK)
  })

  it('起飞点在四条臂的尖端中格（上 / 右 / 下 / 左）', () => {
    // 上臂尖端中格
    expect(cellCenter(startCell(0, 4)).x).toBeCloseTo(CENTER, 5)
    expect(cellCenter(startCell(0, 4)).y).toBeCloseTo(MARGIN + CELL / 2, 5)
    // 右臂尖端中格
    expect(cellCenter(startCell(1, 4)).x).toBeCloseTo(VIEW - MARGIN - CELL / 2, 5)
    expect(cellCenter(startCell(1, 4)).y).toBeCloseTo(CENTER, 5)
    // 下臂尖端中格
    expect(cellCenter(startCell(2, 4)).y).toBeCloseTo(VIEW - MARGIN - CELL / 2, 5)
    // 左臂尖端中格
    expect(cellCenter(startCell(3, 4)).x).toBeCloseTo(MARGIN + CELL / 2, 5)
  })

  it('轨道首尾相接，相邻格距离不超过一格半', () => {
    for (let index = 0; index < TRACK; index += 1) {
      const a = cellCenter(index)
      const b = cellCenter(index + 1)
      const distance = Math.hypot(b.x - a.x, b.y - a.y)
      expect(distance).toBeLessThanOrEqual(CELL * 1.5)
    }
  })

  it('所有格子都落在棋盘范围内', () => {
    for (const point of RING) {
      expect(point.x).toBeGreaterThanOrEqual(MARGIN - 1)
      expect(point.x).toBeLessThanOrEqual(VIEW - MARGIN + 1)
      expect(point.y).toBeGreaterThanOrEqual(MARGIN - 1)
      expect(point.y).toBeLessThanOrEqual(VIEW - MARGIN + 1)
    }
  })
})

describe('终点通道与大本营', () => {
  it('终点通道 6 格，沿臂中线逐渐靠近中心，且不进入中心圆盘', () => {
    const slots = homeLaneSlots(0, 4)
    expect(slots).toHaveLength(6)
    slots.forEach((slot) => expect(slot.x).toBeCloseTo(CENTER, 5))
    for (let index = 1; index < slots.length; index += 1)
      expect(slots[index].y).toBeGreaterThan(slots[index - 1].y)
    const last = slots[slots.length - 1]
    expect(Math.hypot(last.x - CENTER, last.y - CENTER)).toBeGreaterThanOrEqual(GOAL_RADIUS)
  })

  it('人数 >4 时共用中线的两队通道相互错开', () => {
    const first = homeLaneSlots(0, 8)
    const second = homeLaneSlots(7, 8)
    expect(first).toHaveLength(6)
    expect(second).toHaveLength(6)
    // 两队都在上臂中线上，但向两侧对称错开 34
    expect(Math.abs(first[0].x - second[0].x)).toBeCloseTo(34, 5)
    expect((first[0].x + second[0].x) / 2).toBeCloseTo(CENTER, 5)
  })

  it('到家的飞机落在中心圆盘内', () => {
    for (let seat = 0; seat < 8; seat += 1) {
      const slot = homeSlot(seat, 8, 0)
      expect(Math.hypot(slot.x - CENTER, slot.y - CENTER)).toBeLessThan(GOAL_RADIUS)
    }
  })

  it('大本营扇区数量等于人数', () => {
    expect(goalWedges(4)).toHaveLength(4)
    expect(goalWedges(8)).toHaveLength(8)
    goalWedges(4).forEach((wedge) => expect(wedge.path).toMatch(/^M /))
  })
})

describe('机库与飞机场', () => {
  it('4 人局机库在四个角上，机位都在机库内', () => {
    for (let seat = 0; seat < 4; seat += 1) {
      const info = hangarInfo(seat, 4, 4)
      expect(info.slots).toHaveLength(4)
      info.slots.forEach((slot) => {
        expect(slot.x).toBeGreaterThanOrEqual(info.rect.x)
        expect(slot.x).toBeLessThanOrEqual(info.rect.x + info.rect.size)
        expect(slot.y).toBeGreaterThanOrEqual(info.rect.y)
        expect(slot.y).toBeLessThanOrEqual(info.rect.y + info.rect.size)
      })
    }
  })

  it('8 人局机库都落在画布内', () => {
    for (let seat = 0; seat < 8; seat += 1) {
      const info = hangarInfo(seat, 8, 4)
      expect(info.rect.x).toBeGreaterThanOrEqual(-1)
      expect(info.rect.y).toBeGreaterThanOrEqual(-1)
      expect(info.rect.x + info.rect.size).toBeLessThanOrEqual(VIEW + 1)
      expect(info.rect.y + info.rect.size).toBeLessThanOrEqual(VIEW + 1)
    }
  })

  it('4 人局飞机场虚线两两穿心（中点在棋盘中心）', () => {
    const lines = airportLines(4)
    expect(lines).toHaveLength(2)
    lines.forEach((line) => {
      const midX = (line.from.x + line.to.x) / 2
      const midY = (line.from.y + line.to.y) / 2
      expect(midX).toBeCloseTo(CENTER, 5)
      expect(midY).toBeCloseTo(CENTER, 5)
    })
  })
})
