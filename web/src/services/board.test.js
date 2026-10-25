import { describe, expect, it } from 'vitest'
import {
  CELL,
  CENTER,
  GOAL_RADIUS,
  GRID,
  MARGIN,
  RING,
  VIEW,
  airportLines,
  cellCenter,
  goalWedges,
  gridPoint,
  hangarInfo,
  homeLaneSlots,
  homeSlot,
  sectorAngle
} from './board.js'
import { TRACK, startCell } from './rules.js'

describe('方形双层轨道', () => {
  it('共 56 格且互不重复', () => {
    expect(RING).toHaveLength(TRACK)
    const keys = new Set(RING.map((point) => `${point.x}:${point.y}`))
    expect(keys.size).toBe(TRACK)
  })

  it('每条边 7 格外圈 + 7 格内圈', () => {
    const outer = RING.slice(0, 28)
    const inner = RING.slice(28, 56)
    expect(outer).toHaveLength(28)
    expect(inner).toHaveLength(28)
    // 上边外圈贴着上沿
    expect(outer[0].y).toBeCloseTo(MARGIN + CELL / 2, 5)
    // 右边外圈贴着右沿
    expect(outer[4].x).toBeCloseTo(VIEW - MARGIN - CELL / 2, 5)
    // 下方外圈贴着下沿
    expect(outer[11].y).toBeCloseTo(VIEW - MARGIN - CELL / 2, 5)
    // 左边外圈贴着左沿
    expect(outer[18].x).toBeCloseTo(MARGIN + CELL / 2, 5)
  })

  it('4 人起飞点在四条边的中点（上/下外圈 + 上/下内圈）', () => {
    const top = cellCenter(startCell(0, 4))
    expect(top.x).toBeCloseTo(CENTER, 5)
    expect(top.y).toBeCloseTo(MARGIN + CELL / 2, 5)

    const bottom = cellCenter(startCell(1, 4))
    expect(bottom.x).toBeCloseTo(CENTER, 5)
    expect(bottom.y).toBeCloseTo(VIEW - MARGIN - CELL / 2, 5)

    const innerTop = cellCenter(startCell(2, 4))
    expect(innerTop.x).toBeCloseTo(CENTER, 5)
    expect(innerTop.y).toBeCloseTo(MARGIN + CELL * 1.5, 5)

    const innerBottom = cellCenter(startCell(3, 4))
    expect(innerBottom.x).toBeCloseTo(CENTER, 5)
    expect(innerBottom.y).toBeCloseTo(VIEW - MARGIN - CELL * 1.5, 5)
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
  it('终点通道 6 格，从机库内角斜向中心且不进入圆盘', () => {
    const slots = homeLaneSlots(0, 4)
    expect(slots).toHaveLength(6)
    const distances = slots.map((slot) => Math.hypot(slot.x - CENTER, slot.y - CENTER))
    for (let index = 1; index < distances.length; index += 1)
      expect(distances[index]).toBeLessThan(distances[index - 1])
    expect(distances[distances.length - 1]).toBeGreaterThanOrEqual(GOAL_RADIUS)
  })

  it('到家的飞机落在中心圆盘内', () => {
    for (let seat = 0; seat < 8; seat += 1) {
      const slot = homeSlot(seat, 8, 0)
      expect(Math.hypot(slot.x - CENTER, slot.y - CENTER)).toBeLessThan(GOAL_RADIUS)
    }
  })

  it('大本营扇区数量等于人数，且分别朝向各自机库', () => {
    expect(goalWedges(4)).toHaveLength(4)
    expect(goalWedges(8)).toHaveLength(8)
    // 0 号在左上、1 号右上、2 号右下、3 号左下
    const corners = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 }
    ]
    corners.forEach((corner, seat) => {
      const angle = sectorAngle(seat, 4)
      expect(Math.sign(Math.cos(angle))).toBe(corner.x)
      expect(Math.sign(Math.sin(angle))).toBe(corner.y)
    })
    goalWedges(4).forEach((wedge) => expect(wedge.path).toMatch(/^M /))
  })
})

describe('机库与飞机场', () => {
  it('4 人局机库在四个角上，机位都在机库内', () => {
    const corners = [
      { x: MARGIN, y: MARGIN },
      { x: VIEW - MARGIN - CELL * 3, y: MARGIN },
      { x: VIEW - MARGIN - CELL * 3, y: VIEW - MARGIN - CELL * 3 },
      { x: MARGIN, y: VIEW - MARGIN - CELL * 3 }
    ]
    for (let seat = 0; seat < 4; seat += 1) {
      const info = hangarInfo(seat, 4, 4)
      expect(info.slots).toHaveLength(4)
      expect(info.rect.x).toBeCloseTo(corners[seat].x, 5)
      expect(info.rect.y).toBeCloseTo(corners[seat].y, 5)
      info.slots.forEach((slot) => {
        expect(slot.x).toBeGreaterThanOrEqual(info.rect.x)
        expect(slot.x).toBeLessThanOrEqual(info.rect.x + info.rect.size)
        expect(slot.y).toBeGreaterThanOrEqual(info.rect.y)
        expect(slot.y).toBeLessThanOrEqual(info.rect.y + info.rect.size)
      })
    }
  })

  it('5–8 人局多出来的队伍没有独立机库，飞机从起飞格出发', () => {
    for (let seat = 4; seat < 8; seat += 1) {
      const info = hangarInfo(seat, 8, 4)
      expect(info).toBeNull()
    }
    // 第 5 队的终点通道从起飞格通向中心
    const slots = homeLaneSlots(4, 8)
    expect(slots).toHaveLength(6)
    const start = cellCenter(startCell(4, 8))
    expect(Math.hypot(slots[5].x - CENTER, slots[5].y - CENTER)).toBeLessThan(
      Math.hypot(start.x - CENTER, start.y - CENTER)
    )
  })

  it('飞机场航线横穿棋盘中心', () => {
    const lines = airportLines(4)
    expect(lines).toHaveLength(4)
    lines.forEach((line) => {
      // 航线水平，且两端分居棋心两侧
      expect(line.from.y).toBeCloseTo(line.to.y, 5)
      expect(Math.sign(line.from.x - CENTER)).toBe(-Math.sign(line.to.x - CENTER))
    })
  })

  it('网格坐标换算正确', () => {
    const point = gridPoint(0, 0)
    expect(point.x).toBeCloseTo(MARGIN + CELL / 2, 5)
    expect(point.y).toBeCloseTo(MARGIN + CELL / 2, 5)
    expect(gridPoint(GRID - 1, GRID - 1).x).toBeCloseTo(VIEW - MARGIN - CELL / 2, 5)
  })
})
