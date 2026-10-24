// 棋盘几何：56 格外圈排成正方形（每边 14 格），与人数无关；
// 起飞点、终点通道、机库的位置随人数变化。
import { HOME_LANE, TRACK, absoluteCell, startCell } from './rules.js'

export const VIEW = 660
export const MARGIN = 62
export const SPAN = VIEW - MARGIN * 2
export const PER_SIDE = TRACK / 4
export const CELL = SPAN / PER_SIDE
export const CENTER = VIEW / 2

/**
 * 外圈第 index 格的圆心坐标，0 号格在左上角，顺时针排列。
 * 每边 14 格，因此 0 / 14 / 28 / 42 正好落在四个角上 —— 4 人局的起飞点。
 */
export function cellCenter(index) {
  const cell = ((index % TRACK) + TRACK) % TRACK
  const side = Math.floor(cell / PER_SIDE)
  const step = (cell % PER_SIDE) * CELL
  switch (side) {
    case 0:
      return { x: MARGIN + step, y: MARGIN }
    case 1:
      return { x: MARGIN + SPAN, y: MARGIN + step }
    case 2:
      return { x: MARGIN + SPAN - step, y: MARGIN + SPAN }
    default:
      return { x: MARGIN, y: MARGIN + SPAN - step }
  }
}

/** 单位向量：由棋盘中心指向格子外侧（机库就放在这个方向）。 */
export function outwardNormal(index) {
  const point = cellCenter(index)
  const dx = point.x - CENTER
  const dy = point.y - CENTER
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

/** 终点通道的 6 个格位，从外圈最后一格指向中心。 */
export function homeLaneSlots(seat, players) {
  const entry = absoluteCell(seat, TRACK - 1, players)
  const from = cellCenter(entry)
  const dx = CENTER - from.x
  const dy = CENTER - from.y
  const slots = []
  for (let index = 0; index < HOME_LANE; index += 1) {
    const ratio = 0.2 + index * 0.115
    slots.push({ x: from.x + dx * ratio, y: from.y + dy * ratio })
  }
  return slots
}

/** 机库（停机坪）位置与内部每个机位坐标。 */
export function hangarSlots(seat, players, planesPerPlayer) {
  const start = startCell(seat, players)
  const normal = outwardNormal(start)
  const base = cellCenter(start)
  const pad = {
    x: base.x + normal.x * 52,
    y: base.y + normal.y * 52
  }
  const columns = planesPerPlayer <= 4 ? 2 : 3
  const rows = Math.ceil(planesPerPlayer / columns)
  const gap = 22
  const slots = []
  for (let index = 0; index < planesPerPlayer; index += 1) {
    const row = Math.floor(index / columns)
    const column = index % columns
    slots.push({
      x: pad.x + (column - (columns - 1) / 2) * gap,
      y: pad.y + (row - (rows - 1) / 2) * gap
    })
  }
  return { pad, slots }
}

/** 中心大本营里第 index 架已到家飞机的落点。 */
export function homeSlot(seat, players, index) {
  const angle = (seat / Math.max(1, players)) * Math.PI * 2 - Math.PI / 2
  const radius = 16 + index * 9
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius
  }
}

/** 中心大本营的分扇区路径（每位玩家一块）。 */
export function goalWedgePath(seat, players) {
  const step = (Math.PI * 2) / Math.max(1, players)
  const start = (seat / Math.max(1, players)) * Math.PI * 2 - Math.PI / 2 - step / 2
  const end = start + step
  const radius = 46
  const x1 = CENTER + Math.cos(start) * radius
  const y1 = CENTER + Math.sin(start) * radius
  const x2 = CENTER + Math.cos(end) * radius
  const y2 = CENTER + Math.sin(end) * radius
  return `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`
}

/** 飞机场的虚线连线（去重，避免每位玩家画两遍）。 */
export function airportLines(seat, players, airportOf) {
  const from = airportOf(seat, players)
  const to = (from + TRACK / 2) % TRACK
  if (from > to) return null
  return { from: cellCenter(from), to: cellCenter(to) }
}
