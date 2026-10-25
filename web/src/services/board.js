// 棋盘几何：经典飞行棋（按《棋盘.png》还原）。
//
// 布局（13×13 网格）：
//   - 四角 3×3 大机库：左上 / 右上 / 右下 / 左下，各队停机坪（白色虚线内框 + 2×2 白圈飞机位）。
//   - 方形双层轨道：每边 7+7 = 14 格，56 格整；外圈 28 格 + 内圈 28 格，
//     起飞点落在四条边的中点（外圈上 / 下中点 + 内圈上 / 下中点），与 rules.js 的 startCell 对齐。
//   - 四条对角彩条：各队从自家机库内角斜插进中心大本营，即终点通道。
//   - 中心：四色大本营圆盘，扇区朝向各自机库。
//   - 天空：云朵、装饰飞机、虚线航迹、左边标题、右边口号。
import { FLY_DISTANCE, HOME_LANE, TRACK, airportCell, startCell } from './rules.js'

export const GRID = 13
export const CELL = 64
export const MARGIN = 30
export const VIEW = GRID * CELL + MARGIN * 2
export const CENTER = VIEW / 2
export const GOAL_RADIUS = 76
export const HANGAR_SIZE = CELL * 3
export const TRACK_CELL = CELL - 4
export const LANE_CELL = Math.round(CELL * 0.46)

export function gridPoint(col, row) {
  return { x: MARGIN + (col + 0.5) * CELL, y: MARGIN + (row + 0.5) * CELL }
}

// 56 格轨道（环形顺序）：外圈顺时针 28 格（从上方中点出发）→ 内圈顺时针 28 格（从内圈上方中点出发）
// 坐标为 [col, row]，0 号格 = 外圈上方中点（起飞点）
const RING_GRID = [
  // 外圈 0–27
  [6, 0], [7, 0], [8, 0], [9, 0],
  [12, 3], [12, 4], [12, 5], [12, 6], [12, 7], [12, 8], [12, 9],
  [9, 12], [8, 12], [7, 12], [6, 12], [5, 12], [4, 12], [3, 12],
  [0, 9], [0, 8], [0, 7], [0, 6], [0, 5], [0, 4], [0, 3],
  [3, 0], [4, 0], [5, 0],
  // 内圈 28–55
  [6, 1], [7, 1], [8, 1], [9, 1],
  [11, 3], [11, 4], [11, 5], [11, 6], [11, 7], [11, 8], [11, 9],
  [9, 11], [8, 11], [7, 11], [6, 11], [5, 11], [4, 11], [3, 11],
  [1, 9], [1, 8], [1, 7], [1, 6], [1, 5], [1, 4], [1, 3],
  [3, 1], [4, 1], [5, 1]
]

export const RING = RING_GRID.map(([col, row]) => gridPoint(col, row))

/**
 * 四角的斜切格：压在机库角上（对应参考图的切角三角），
 * 让方形边框看起来是连成一体的一圈。ring 表示它承接的轨道格序号。
 */
export const CORNER_CUTS = [
  { col: 1, row: 2, ring: 25 },
  { col: 2, row: 1, ring: 24 },
  { col: 10, row: 1, ring: 3 },
  { col: 11, row: 2, ring: 4 },
  { col: 11, row: 10, ring: 10 },
  { col: 10, row: 11, ring: 11 },
  { col: 2, row: 11, ring: 17 },
  { col: 1, row: 10, ring: 18 }
]

export function cellCenter(index) {
  return RING[((index % TRACK) + TRACK) % TRACK]
}

// 四角 3×3 大机库（左上 / 右上 / 右下 / 左下）——座位 0..3 依次对应
const BASE_CORNERS = [
  { col: 0, row: 0 },
  { col: 10, row: 0 },
  { col: 10, row: 10 },
  { col: 0, row: 10 }
]

/**
 * 机库信息：位置、停机位、队名标签位置。
 * 只有前 4 队有独立机库（放在四角）；5 人以上多出来的队伍直接从各自起飞格出发。
 */
export function hangarInfo(seat, players, planesPerPlayer) {
  const big = seat < 4
  if (!big) return null
  const anchor = BASE_CORNERS[seat]
  const size = HANGAR_SIZE
  const rect = { x: MARGIN + anchor.col * CELL, y: MARGIN + anchor.row * CELL, size }
  const columns = planesPerPlayer <= 4 ? 2 : 3
  const rows = Math.ceil(planesPerPlayer / columns)
  const gap = 62
  const circleR = 27
  const cx = rect.x + size / 2
  const cy = rect.y + size / 2 + 14
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
    rect,
    // 机库底板略微外扩并用大圆角，让边框两端的角格被机库"切"住（参考图的切角效果）
    plate: { x: rect.x - 6, y: rect.y - 6, size: size + 12 },
    slots,
    label: { x: cx, y: rect.y + 30 },
    circleR,
    labelSize: 24,
    big: true
  }
}

/** 机库内角（对角通道的起点）：取机库方块里离棋盘中心最近的那个角。 */
export function hangarInnerCorner(seat, players) {
  const info = hangarInfo(seat, players, 1)
  const { x, y, size } = info.rect
  const corners = [
    { x, y },
    { x: x + size, y },
    { x, y: y + size },
    { x: x + size, y: y + size }
  ]
  let best = corners[0]
  let bestDistance = Infinity
  for (const corner of corners) {
    const distance = Math.hypot(corner.x - CENTER, corner.y - CENTER)
    if (distance < bestDistance) {
      bestDistance = distance
      best = corner
    }
  }
  return best
}

/**
 * 终点通道：
 *  - 1–4 队：从自家机库内角沿对角彩条斜插进中心大本营（与参考图一致）。
 *  - 5 队以上：没有独立机库，从起飞格沿半径方向直线进中心。
 */
export function homeLaneSlots(seat, players) {
  const from = seat < 4 ? hangarInnerCorner(seat, players) : cellCenter(startCell(seat, players))
  const dx = CENTER - from.x
  const dy = CENTER - from.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const start = seat < 4 ? CELL * 1.15 : CELL * 0.7
  const end = length - GOAL_RADIUS - LANE_CELL * 0.4
  const slots = []
  for (let index = 0; index < HOME_LANE; index += 1) {
    const t = index / (HOME_LANE - 1)
    const d = start + (end - start) * t
    slots.push({ x: from.x + ux * d, y: from.y + uy * d })
  }
  return slots
}

/** 大本营扇区中心角：1–4 队朝向自家机库，5 队以上朝向自己的起飞格。 */
export function sectorAngle(seat, players) {
  if (seat < 4) {
    const anchor = BASE_CORNERS[seat]
    const point = gridPoint(anchor.col + 1.5, anchor.row + 1.5)
    return Math.atan2(point.y - CENTER, point.x - CENTER)
  }
  const point = cellCenter(startCell(seat, players))
  return Math.atan2(point.y - CENTER, point.x - CENTER)
}
/** 已到家飞机在大本营里的停机位。 */
export function homeSlot(seat, players, index) {
  const angle = sectorAngle(seat, players)
  const radius = 18 + index * 11
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius }
}

/** 中心大本营的扇区路径。 */
export function goalWedges(players) {
  const half = Math.PI / Math.max(1, players)
  return Array.from({ length: players }, (_, seat) => {
    const mid = sectorAngle(seat, players)
    const x1 = CENTER + Math.cos(mid - half) * GOAL_RADIUS
    const y1 = CENTER + Math.sin(mid - half) * GOAL_RADIUS
    const x2 = CENTER + Math.cos(mid + half) * GOAL_RADIUS
    const y2 = CENTER + Math.sin(mid + half) * GOAL_RADIUS
    return { seat, path: `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${GOAL_RADIUS} ${GOAL_RADIUS} 0 0 1 ${x2} ${y2} Z` }
  })
}

/** 飞机场之间的穿心航线（去重）。 */
export function airportLines(players) {
  const lines = []
  const seen = new Set()
  for (let seat = 0; seat < players; seat += 1) {
    const from = airportCell(seat, players)
    const to = (from + FLY_DISTANCE) % TRACK
    const key = [from, to].sort((a, b) => a - b).join('-')
    if (seen.has(key)) continue
    seen.add(key)
    lines.push({ from: cellCenter(from), to: cellCenter(to) })
  }
  return lines
}

/** 天空装饰：云朵。 */
export const CLOUDS = [
  { x: 156, y: 128, scale: 1 },
  { x: 742, y: 150, scale: 0.8 },
  { x: 140, y: 762, scale: 0.85 },
  { x: 762, y: 748, scale: 1 },
  { x: 452, y: 92, scale: 0.7 }
]

/** 天空装饰：飞行中的小飞机（放在中间的空白区）。 */
export const DECOR_PLANES = [
  { x: 186, y: 306, angle: -18, scale: 0.8 },
  { x: 704, y: 596, angle: 162, scale: 0.75 },
  { x: 452, y: 214, angle: 22, scale: 0.5 }
]

/** 天空装饰：虚线航迹。 */
export const TRAILS = [
  'M 150,182 C 240,120 330,206 420,168',
  'M 470,700 C 560,748 640,672 742,712',
  'M 604,232 C 664,286 700,232 764,268'
]
