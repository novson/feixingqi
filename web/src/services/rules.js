// 与服务端 rules.js 保持一致的棋盘数学（客户端只用于渲染与提示）。

export const TRACK = 56
export const PER_SIDE = TRACK / 4
export const HOME_LANE = 6
export const FINISH = TRACK + HOME_LANE
export const HANGAR = -1
export const TAKEOFF_DIE = 6
export const MAX_ROLL_STREAK = 3
// 与服务端一致：双层轨道下飞棋跨 14 格，正好落到棋盘对面一侧的机场
export const FLY_DISTANCE = TRACK / 4
export const MAX_PLAYERS = 8
export const MIN_PLAYERS = 2

// 前四个颜色就是经典四色（红 / 蓝 / 黄 / 绿），4 人局正好落在四个角的机库上
export const COLORS = [
  { key: 'red', name: '红', hex: '#e5484d', soft: '#fdecec' },
  { key: 'blue', name: '蓝', hex: '#3e63dd', soft: '#e7ecfb' },
  { key: 'yellow', name: '黄', hex: '#e8a800', soft: '#fdf4da' },
  { key: 'green', name: '绿', hex: '#2fa46b', soft: '#e4f5ec' },
  { key: 'orange', name: '橙', hex: '#f0761d', soft: '#fdefe1' },
  { key: 'cyan', name: '青', hex: '#12a3c4', soft: '#e2f4fa' },
  { key: 'purple', name: '紫', hex: '#8e4ec6', soft: '#f2e9fa' },
  { key: 'pink', name: '粉', hex: '#e0457f', soft: '#fde8f1' }
]

export function colorOf(seat) {
  return COLORS[((seat % COLORS.length) + COLORS.length) % COLORS.length]
}

/** 沿外圈等距分布，4 人局正好落在四个角（0/14/28/42），与棋盘几何的四个角重合。 */
export function startCell(seat, players) {
  const count = Math.max(MIN_PLAYERS, players)
  return Math.round((seat * TRACK) / count) % TRACK
}

export function airportCell(seat, players) {
  const span = Math.floor(TRACK / Math.max(MIN_PLAYERS, players))
  const offset = Math.max(1, Math.floor(span / 2))
  return (startCell(seat, players) + offset) % TRACK
}

export function cellColor(cell, players) {
  const count = Math.max(MIN_PLAYERS, players)
  return (((cell % count) + count) % count)
}

export function absoluteCell(seat, position, players) {
  return (startCell(seat, players) + position) % TRACK
}

export function isOnTrack(position) {
  return position >= 0 && position < TRACK
}

export function jumpDistanceFor(players, jumpMode) {
  return jumpMode === 'CLASSIC4' ? 4 : Math.max(2, players)
}

export function progressOf(player) {
  const home = player.planes.filter((position) => position === FINISH).length * 1000
  return home + player.planes.reduce((sum, position) => sum + Math.max(0, position), 0)
}
