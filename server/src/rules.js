/**
 * 飞行棋棋盘数学与规则常量。
 *
 * 棋盘：56 格外圈（每边 14 格，四个角即 4 人局的起飞点），每格按 玩家数 循环着色 —— 例如 4 人时
 * 格子颜色为 红蓝黄绿红蓝黄绿……，因此「跳棋 = 跳到下一个同色格」在 4 人局
 * 正好前进 4 格（经典规则），8 人局前进 8 格，各玩家机会均等。
 *
 * 棋子位置用一个整数表示：
 *   -1        机库（未起飞）
 *   0..55     外圈，相对自己起飞点走过的格数（绝对格 = (起飞点 + 位置) % 56）
 *   56..61    自己的终点通道（6 格，只有自己能进）
 *   62        到家
 */

// 56 格外圈：每边 14 格，能被 2 / 4 / 7 / 8 整除，
// 4 人局起飞点落在四个角（0/14/28/42），8 人局也能完全均分。
export const TRACK = 56
export const HOME_LANE = 6
export const FINISH = TRACK + HOME_LANE
export const HANGAR = -1
export const PER_SIDE = TRACK / 4

export const DIE_FACES = 6
export const TAKEOFF_DIE = 6
export const MAX_ROLL_STREAK = 3
export const FLY_DISTANCE = TRACK / 2

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8
export const DEFAULT_PLANES = 4

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

/**
 * 第 seat 位玩家的起飞点（绝对格）：沿外圈等距分布。
 * 56 能被 2/4/7/8 整除，这几种人数下是完美均分；4 人局正好落在四个角（0/14/28/42），
 * 与棋盘几何的四个角（每边 14 格）重合，也是经典棋盘起飞点的位置。
 */
export function startCell(seat, players) {
  const count = Math.max(MIN_PLAYERS, players)
  return Math.round((seat * TRACK) / count) % TRACK
}

/** 第 seat 位玩家的飞机场（绝对格）：位于自家一侧的中段，飞过去正好半圈。 */
export function airportCell(seat, players) {
  const span = Math.floor(TRACK / Math.max(MIN_PLAYERS, players))
  const offset = Math.max(1, Math.floor(span / 2))
  return (startCell(seat, players) + offset) % TRACK
}

/** 绝对格的颜色序号，等于能在此格触发跳棋的座位号。 */
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

export function isHome(position) {
  return position === FINISH
}

/** 跳棋距离：AUTO 模式下等于玩家数（4 人即经典的 4 格），CLASSIC4 固定 4 格。 */
export function jumpDistanceFor(players, jumpMode) {
  if (jumpMode === 'CLASSIC4') return 4
  return Math.max(2, players)
}

/**
 * 落点结算：跳棋与飞棋只各触发一次，跳跃后不会越过大本营（否则该次效果取消）。
 * 返回最终位置与触发的效果列表。
 */
export function resolveLanding(seat, target, players, options = {}) {
  const jumpMode = options.jumpMode || 'AUTO'
  const jumpDistance = options.jumpDistance || jumpDistanceFor(players, jumpMode)
  const flyEnabled = options.flyEnabled !== false
  const airport = airportCell(seat, players)

  let position = target
  const effects = []
  let jumpsLeft = 1
  let fliesLeft = 1
  let guard = 0

  while (isOnTrack(position) && guard++ < 8) {
    const cell = absoluteCell(seat, position, players)
    if (flyEnabled && fliesLeft > 0 && cell === airport && position + FLY_DISTANCE <= FINISH) {
      position += FLY_DISTANCE
      fliesLeft -= 1
      effects.push('FLY')
      // 飞到对面飞机场后按规则再前进一个同色间距
      if (jumpsLeft > 0 && isOnTrack(position) && position + jumpDistance <= FINISH) {
        position += jumpDistance
        jumpsLeft -= 1
        effects.push('JUMP')
      }
      continue
    }
    if (jumpsLeft > 0 && cellColor(cell, players) === seat && position + jumpDistance <= FINISH) {
      position += jumpDistance
      jumpsLeft -= 1
      effects.push('JUMP')
      continue
    }
    break
  }

  return { position, effects }
}

const EFFECT_TEXT = { JUMP: '跳棋', FLY: '飞棋' }

export function describeEffects(effects) {
  return effects.map((effect) => EFFECT_TEXT[effect] || effect)
}
