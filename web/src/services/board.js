// 棋盘几何：经典十字飞行棋 —— 56 格外圈排成正方形（每边 14 格），
// 四角是各队机库，四条飞机场虚线穿心，终点通道从四角内侧斜插进中心四色大本营。
// 人数变化时只改变起飞点 / 机库 / 通道的位置，外圈格子本身不变。
import { HOME_LANE, TRACK, absoluteCell, startCell } from './rules.js'

export const VIEW = 700
export const CENTER = VIEW / 2
export const MARGIN = 140
export const SPAN = VIEW - MARGIN * 2
export const PER_SIDE = TRACK / 4
export const CELL = SPAN / PER_SIDE
export const GOAL_RADIUS = 78
export const HANGAR_SIZE = 84
export const HANGAR_DISTANCE = 88

/** 外圈第 index 格的圆心：0 号格在左上角，沿上边向右，再顺时针绕一圈。 */
export function cellCenter(index) {
  const cell = ((index % TRACK) + TRACK) % TRACK
  const side = Math.floor(cell / PER_SIDE)
  const step = (cell % PER_SIDE + 0.5) * CELL
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

/** 由棋盘中心指向格子外侧的单位向量（机库放在这个方向上）。 */
export function outwardNormal(index) {
  const point = cellCenter(index)
  const dx = point.x - CENTER
  const dy = point.y - CENTER
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

/** 终点通道：从该玩家绕完一圈的最后一格斜插进中心，共 6 格。 */
export function homeLaneSlots(seat, players) {
  const entry = absoluteCell(seat, TRACK - 1, players)
  const from = cellCenter(entry)
  const dx = CENTER - from.x
  const dy = CENTER - from.y
  const slots = []
  for (let index = 0; index < HOME_LANE; index += 1) {
    const ratio = 0.3 + index * 0.08
    slots.push({ x: from.x + dx * ratio, y: from.y + dy * ratio })
  }
  return slots
}

/** 机库（停机坪）：外圈外侧的圆角方块，内部 2×2 停机位。 */
export function hangarSlots(seat, players, planesPerPlayer) {
  const start = startCell(seat, players)
  const normal = outwardNormal(start)
  const base = cellCenter(start)
  const pad = {
    x: base.x + normal.x * HANGAR_DISTANCE,
    y: base.y + normal.y * HANGAR_DISTANCE
  }
  const columns = planesPerPlayer <= 4 ? 2 : 3
  const rows = Math.ceil(planesPerPlayer / columns)
  const gap = 24
  const slots = []
  for (let index = 0; index < planesPerPlayer; index += 1) {
    const row = Math.floor(index / columns)
    const column = index % columns
    slots.push({
      x: pad.x + (column - (columns - 1) / 2) * gap,
      y: pad.y + (row - (rows - 1) / 2) * gap + 6
    })
  }
  // 队名标签：人多时机库会贴近画布边缘，这里把文字收敛回可见区域
  const label = {
    x: Math.min(VIEW - 34, Math.max(34, pad.x)),
    y: Math.min(VIEW - 8, Math.max(16, pad.y - HANGAR_SIZE / 2 - 6))
  }
  return { pad, slots, label }
}

/** 中心大本营里已到家飞机的落点：停在自己颜色的扇区里。 */
export function homeSlot(seat, players, index) {
  const angle = sectorAngle(seat, players)
  const radius = 30 + index * 12
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius
  }
}

/** 扇区中心角度：4 人局依次是 左上 / 右上 / 右下 / 左下。 */
export function sectorAngle(seat, players) {
  const step = (Math.PI * 2) / Math.max(1, players)
  return (-135 * Math.PI) / 180 + seat * step
}

/** 中心大本营的扇区路径。 */
export function goalWedgePath(seat, players) {
  const step = (Math.PI * 2) / Math.max(1, players)
  const start = sectorAngle(seat, players) - step / 2
  const end = start + step
  const x1 = CENTER + Math.cos(start) * GOAL_RADIUS
  const y1 = CENTER + Math.sin(start) * GOAL_RADIUS
  const x2 = CENTER + Math.cos(end) * GOAL_RADIUS
  const y2 = CENTER + Math.sin(end) * GOAL_RADIUS
  return `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${GOAL_RADIUS} ${GOAL_RADIUS} 0 0 1 ${x2} ${y2} Z`
}

/** 飞机场之间的虚线连线（去重，避免两端各画一次）。 */
export function airportLines(seat, players, airportOf) {
  const from = airportOf(seat, players)
  const to = (from + TRACK / 2) % TRACK
  if (from > to) return null
  return { from: cellCenter(from), to: cellCenter(to) }
}

/** 背景装饰：云朵位置（还原天空风格）。 */
export const CLOUDS = [
  { x: 78, y: 250, scale: 0.9 },
  { x: 622, y: 300, scale: 0.75 },
  { x: 150, y: 636, scale: 0.7 },
  { x: 556, y: 646, scale: 0.85 }
]
