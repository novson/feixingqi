import { FINISH, HANGAR, TRACK, absoluteCell, isOnTrack } from './rules.js'

/**
 * AI 出招：优先撞子与到家，其次推进度，并尽量避开被追尾的格子。
 * 只做启发式打分，不搜索深层局面。
 */
export function chooseMove(game, seat, legal) {
  if (!legal || legal.length === 0) return null
  let best = null
  let bestScore = -Infinity
  for (const move of legal) {
    const score = scoreMove(game, seat, move) + Math.random() * 6
    if (score > bestScore) {
      bestScore = score
      best = move
    }
  }
  return best ? best.plane : null
}

function scoreMove(game, seat, move) {
  const players = game.seatCount
  let score = 0
  if (move.finishes) score += 900
  score += move.crashed.length * 170
  if (move.takeoff) score += 90
  if (move.effects.includes('FLY')) score += 70
  if (move.effects.includes('JUMP')) score += 25

  const from = move.from === HANGAR ? 0 : move.from
  score += (move.to - from) * 3

  if (move.to >= TRACK) {
    score += 45 // 进终点通道后绝对安全
    if (move.to === FINISH) score += 200
  } else {
    const cell = absoluteCell(seat, move.to, players)
    let threats = 0
    game.players.forEach((other) => {
      if (other.seat === seat || other.rank !== null) return
      other.planes.forEach((position) => {
        if (!isOnTrack(position)) return
        const otherCell = absoluteCell(other.seat, position, players)
        const behind = (cell - otherCell + TRACK) % TRACK
        if (behind >= 1 && behind <= 6) threats += 1
      })
    })
    score -= threats * 32
  }
  return score
}
