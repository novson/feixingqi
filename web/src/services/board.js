// 棋盘几何：经典十字飞行棋，按《棋盘.png》还原。
//
// 结构（15×15 网格）：
//   - 轨道 = 十字外轮廓共 56 格，每条臂贡献 14 格：
//     [尖端中格(起飞点), 尖端边格, 外侧 5 格, 斜角格, 内侧 5 格, 尖端边格]
//     起飞点正好是四条臂的尖端中格（0/14/28/42），与 rules.js 的 startCell 完全一致。
//   - 四角 block（6×6）：人数 ≤4 时放机库；block 内角那格是轨道的斜角格（4 人局的飞机场）。
//   - 四条臂的中线：终点通道（6 格，从尖端通向中心圆盘）。
//   - 中心：大本营圆盘，扇区按座位数均分，扇区朝向各自的臂。
import { HOME_LANE, TRACK, airportCell, startCell } from './rules.js'

export const VIEW = 1120
export const GRID = 15
export const CELL = 54
export const MARGIN = (VIEW - CELL * GRID) / 2
export const CENTER = VIEW / 2
export const GOAL_RADIUS = 78
export const HANGAR_SIZE = CELL * 5
export const TRACK_CELL = Math.round(CELL * 0.8)
export const LANE_CELL = Math.round(CELL * 0.58)

export function gridPoint(col, row) {
  return { x: MARGIN + (col + 0.5) * CELL, y: MARGIN + (row + 0.5) * CELL }
}

// 每条臂的 14 个网格坐标：顺时针，从尖端中格（起飞点）开始，收在下一个起飞点前
const ARMS = [
  // 上臂：尖端中 → 右 → 沿右侧下行 → 斜角 → 右臂上边向右 → 右臂尖端
  [[7, 0], [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [9, 5], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6]],
  // 右臂：尖端中 → 下 → 沿下边向左 → 斜角 → 下臂右边下行 → 下臂尖端
  [[14, 7], [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], [9, 9], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14]],
  // 下臂：尖端中 → 左 → 沿左侧上行 → 斜角 → 左臂下边向左 → 左臂尖端
  [[7, 14], [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], [5, 9], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]],
  // 左臂：尖端中 → 上 → 沿上边向右 → 斜角 → 上臂左边上行 → 回到上臂尖端
  [[0, 7], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [5, 5], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0]]
]

// 外圈 56 格的圆心（绝对格 0..55）
export const RING = ARMS.flat().map(([col, row]) => gridPoint(col, row))

// 四个斜角格：轨道在角落「切角」的位置，4 人局正好是各队飞机场
export const CORNER_CELLS = new Set([7, 21, 35, 49])

export function cellCenter(index) {
  return RING[((index % TRACK) + TRACK) % TRACK]
}

// 臂编号：0 上 / 1 右 / 2 下 / 3 左（由起飞点推出）
export function armOf(seat, players) {
  return ((Math.round(startCell(seat, players) / 14) % 4) + 4) % 4
}

// 臂中线：单位向量（指向中心）+ 通道第一格
const ARM_AXIS = [
  { unit: { x: 0, y: 1 }, from: [7, 1] },
  { unit: { x: -1, y: 0 }, from: [13, 7] },
  { unit: { x: 0, y: -1 }, from: [7, 13] },
  { unit: { x: 1, y: 0 }, from: [1, 7] }
]

/** 终点通道的 6 个落点：沿臂中线通向中心圆盘；人数 >4 时中线由两队共用，各自向两侧错开。 */
export function homeLaneSlots(seat, players) {
  const axis = ARM_AXIS[armOf(seat, players)]
  const from = gridPoint(axis.from[0], axis.from[1])
  const edge = { x: CENTER - axis.unit.x * GOAL_RADIUS, y: CENTER - axis.unit.y * GOAL_RADIUS }
  const base = []
  for (let index = 0; index < HOME_LANE; index += 1) {
    const t = (index * 0.96) / (HOME_LANE - 1)
    base.push({ x: from.x + (edge.x - from.x) * t, y: from.y + (edge.y - from.y) * t })
  }
  if (players <= 4) return base
  const mates = []
  for (let other = 0; other < players; other += 1)
    if (armOf(other, players) === armOf(seat, players)) mates.push(other)
  const offset = (mates.indexOf(seat) - (mates.length - 1) / 2) * 34
  const px = -axis.unit.y
  const py = axis.unit.x
  return base.map((point) => ({ x: point.x + px * offset, y: point.y + py * offset }))
}

/** 大本营扇区中心角：人数 ≤4 时对准各自的臂，人多时按起飞点比例均分圆周。 */
export function sectorAngle(seat, players) {
  if (players <= 4) {
    const arm = armOf(seat, players)
    return ((-90 + arm * 90) * Math.PI) / 180
  }
  return ((-90 + (startCell(seat, players) / TRACK) * 360) * Math.PI) / 180
}

/** 已到家飞机在大本营扇区里的停机位。 */
export function homeSlot(seat, players, index) {
  const angle = sectorAngle(seat, players)
  const radius = 20 + index * 10
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius }
}

/** 中心大本营的扇区路径（扇区朝向各自的臂）。 */
export function goalWedges(players) {
  const half = Math.PI / Math.max(1, players)
  const result = []
  for (let seat = 0; seat < players; seat += 1) {
    const mid = sectorAngle(seat, players)
    const x1 = CENTER + Math.cos(mid - half) * GOAL_RADIUS
    const y1 = CENTER + Math.sin(mid - half) * GOAL_RADIUS
    const x2 = CENTER + Math.cos(mid + half) * GOAL_RADIUS
    const y2 = CENTER + Math.sin(mid + half) * GOAL_RADIUS
    result.push({ seat, path: `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${GOAL_RADIUS} ${GOAL_RADIUS} 0 0 1 ${x2} ${y2} Z` })
  }
  return result
}

// 人数 ≤4 时机库所在的四角 block（左上 / 右上 / 右下 / 左下）
const CORNER_RECTS = [
  { x: MARGIN, y: MARGIN },
  { x: MARGIN + CELL * 10, y: MARGIN },
  { x: MARGIN + CELL * 10, y: MARGIN + CELL * 10 },
  { x: MARGIN, y: MARGIN + CELL * 10 }
]

/** 机库：位置、停机位、队名标签。人数 ≤4 用四角大机库，更多人围成一圈。 */
export function hangarInfo(seat, players, planesPerPlayer) {
  let rect
  let size = HANGAR_SIZE
  if (players <= 4) {
    rect = CORNER_RECTS[armOf(seat, players)]
  } else {
    size = 140
    const angle = sectorAngle(seat, players)
    const radius = CELL * (GRID / 2) + size / 2 + 8
    rect = {
      x: CENTER + Math.cos(angle) * radius - size / 2,
      y: CENTER + Math.sin(angle) * radius - size / 2
    }
  }
  const big = size >= HANGAR_SIZE
  const columns = planesPerPlayer <= 4 ? 2 : 3
  const rows = Math.ceil(planesPerPlayer / columns)
  const gap = big ? 66 : 40
  const circleR = big ? 30 : 19
  const cx = rect.x + size / 2
  const cy = rect.y + size / 2 + (big ? 16 : 8)
  const slots = []
  for (let index = 0; index < planesPerPlayer; index += 1) {
    const row = Math.floor(index / columns)
    const col = index % columns
    slots.push({
      x: cx + (col - (columns - 1) / 2) * gap,
      y: cy + (row - (rows - 1) / 2) * gap
    })
  }
  return {
    rect: { x: rect.x, y: rect.y, size },
    slots,
    label: { x: cx, y: rect.y + (big ? 36 : 24) },
    circleR,
    labelSize: big ? 26 : 15
  }
}

/** 飞机场之间的穿心虚线（去重）。 */
export function airportLines(players) {
  const lines = []
  const seen = new Set()
  for (let seat = 0; seat < players; seat += 1) {
    const from = airportCell(seat, players)
    const to = (from + TRACK / 2) % TRACK
    const key = [from, to].sort((a, b) => a - b).join('-')
    if (seen.has(key)) continue
    seen.add(key)
    lines.push({ from: cellCenter(from), to: cellCenter(to) })
  }
  return lines
}

/** 背景装饰：云朵（画在棋盘四周的天空里）。 */
export const CLOUDS = [
  { x: 150, y: 84, scale: 1 },
  { x: 990, y: 118, scale: 0.8 },
  { x: 118, y: 1038, scale: 0.85 },
  { x: 1005, y: 1062, scale: 1 },
  { x: 705, y: 52, scale: 0.7 }
]

/** 装饰小飞机剪影（天空里飞过的那种）。 */
export const DECOR_PLANES = [
  { x: 336, y: 94, angle: -14, scale: 1 },
  { x: 796, y: 1082, angle: 166, scale: 0.9 }
]
