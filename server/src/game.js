import { randomUUID } from 'node:crypto'
import {
  DEFAULT_PLANES,
  FINISH,
  HANGAR,
  MAX_PLAYERS,
  MAX_ROLL_STREAK,
  MIN_PLAYERS,
  TAKEOFF_DIE,
  absoluteCell,
  colorOf,
  isOnTrack,
  resolveLanding
} from './rules.js'

export const PHASE = { LOBBY: 'LOBBY', PLAYING: 'PLAYING', FINISHED: 'FINISHED' }
export const TURN_STATE = { ROLL: 'ROLL', MOVE: 'MOVE' }

const LOG_LIMIT = 40

/**
 * 一局飞行棋的完整状态机。所有规则判定都在服务端完成，
 * 客户端只负责渲染和发送 roll / move 指令。
 */
export class Game {
  constructor(options = {}) {
    this.id = options.id || randomUUID()
    this.name = options.name || '飞行棋房间'
    this.hostId = options.hostId || null
    this.maxPlayers = clamp(options.maxPlayers || 4, MIN_PLAYERS, MAX_PLAYERS)
    this.planesPerPlayer = clamp(options.planesPerPlayer || DEFAULT_PLANES, 1, 6)
    this.jumpMode = options.jumpMode === 'CLASSIC4' ? 'CLASSIC4' : 'AUTO'
    this.flyEnabled = options.flyEnabled !== false
    this.endOnFirst = options.endOnFirst !== false
    this.players = []
    this.phase = PHASE.LOBBY
    this.turnSeat = 0
    this.turnState = TURN_STATE.ROLL
    this.die = null
    this.streak = 0
    this.legal = []
    this.log = []
    this.ranking = []
    this.version = 1
    this.turnDeadline = null
    this.createdAt = Date.now()
    this.startedAt = null
    this.finishedAt = null
    this.rng = options.rng || (() => 1 + Math.floor(Math.random() * 6))
  }

  get seatCount() {
    return this.players.length
  }

  playerById(playerId) {
    return this.players.find((player) => player.id === playerId) || null
  }

  seatOf(playerId) {
    const player = this.playerById(playerId)
    return player ? player.seat : -1
  }

  currentPlayer() {
    return this.players.find((player) => player.seat === this.turnSeat) || null
  }

  activePlayers() {
    return this.players.filter((player) => player.rank === null)
  }

  addPlayer({ nickname, accountId = null, ai = false }) {
    if (this.phase !== PHASE.LOBBY) throw new GameError('对局已经开始，无法加入')
    if (this.players.length >= this.maxPlayers) throw new GameError('房间已满')
    const player = {
      id: randomUUID(),
      seat: this.players.length,
      nickname,
      accountId,
      ai,
      reconnectToken: randomUUID(),
      connected: !ai,
      planes: Array.from({ length: this.planesPerPlayer }, () => HANGAR),
      rank: null,
      stats: { crashes: 0, jumps: 0, flies: 0, rolls: 0 }
    }
    this.players.push(player)
    this.version += 1
    if (!this.hostId) this.hostId = player.id
    return player
  }

  removePlayer(playerId) {
    const index = this.players.findIndex((player) => player.id === playerId)
    if (index < 0) return false
    const [removed] = this.players.splice(index, 1)
    this.players.forEach((player, seat) => {
      player.seat = seat
    })
    if (this.hostId === removed.id) this.hostId = this.players[0]?.id || null
    this.version += 1
    if (this.phase === PHASE.PLAYING) {
      // 局中退出：剩余真人不足时直接结束，避免卡住回合
      const humans = this.players.filter((player) => !player.ai)
      if (humans.length === 0) this.endGame('所有玩家已离开')
      else if (this.turnSeat >= this.players.length) this.turnSeat = 0
      else this.refreshTurnDeadline()
    }
    return true
  }

  canStart() {
    return this.phase === PHASE.LOBBY && this.players.length >= MIN_PLAYERS
  }

  start() {
    if (!this.canStart()) throw new GameError('至少需要 2 位玩家才能开始')
    this.phase = PHASE.PLAYING
    this.startedAt = Date.now()
    this.players.forEach((player) => {
      player.planes = Array.from({ length: this.planesPerPlayer }, () => HANGAR)
      player.rank = null
      player.stats = { crashes: 0, jumps: 0, flies: 0, rolls: 0 }
    })
    this.ranking = []
    this.turnSeat = 0
    this.turnState = TURN_STATE.ROLL
    this.die = null
    this.streak = 0
    this.legal = []
    this.pushLog(null, `游戏开始，${this.players.length} 人局`, 'SYSTEM')
    this.refreshTurnDeadline()
    this.version += 1
    return this
  }

  refreshTurnDeadline(seconds) {
    this.turnDeadline = seconds ? Date.now() + seconds * 1000 : null
  }

  /** 掷骰。返回本次的合法走法预览（可能为空，表示无棋可走）。 */
  roll(playerId, turnSeconds = 0) {
    this.requireTurn(playerId, TURN_STATE.ROLL)
    const player = this.currentPlayer()
    const die = clamp(Math.round(this.rng()), 1, 6)
    player.stats.rolls += 1
    this.die = die
    this.streak = die === TAKEOFF_DIE ? this.streak + 1 : 0
    this.legal = this.legalPlanes(player.seat, die)
    this.pushLog(player.seat, `${player.nickname} 掷出 ${die} 点`, 'ROLL')

    if (this.streak > MAX_ROLL_STREAK || this.legal.length === 0) {
      const reason = this.streak > MAX_ROLL_STREAK ? '连续 3 次 6 点，本回合结束' : '无棋可走'
      this.pushLog(player.seat, reason, 'SYSTEM')
      this.finishTurn(turnSeconds)
      return { die, legal: [], auto: reason }
    }
    if (this.legal.length === 1) {
      // 只有一种走法时自动落子，减少无谓点击
      const only = this.legal[0]
      this.move(playerId, only.plane, turnSeconds)
      return { die, legal: [], auto: 'AUTO_MOVED' }
    }
    this.turnState = TURN_STATE.MOVE
    this.refreshTurnDeadline(turnSeconds)
    this.version += 1
    return { die, legal: this.legal, auto: null }
  }

  /** 计算某一点数下所有合法走法及其后果预览。 */
  legalPlanes(seat, die) {
    const player = this.players[seat]
    if (!player) return []
    const moves = []
    player.planes.forEach((position, plane) => {
      const preview = this.previewMove(seat, plane, die)
      if (preview) moves.push(preview)
    })
    return moves
  }

  previewMove(seat, planeIndex, die) {
    const player = this.players[seat]
    if (!player) return null
    const from = player.planes[planeIndex]
    if (from === undefined || from === FINISH) return null

    if (from === HANGAR) {
      if (die !== TAKEOFF_DIE) return null
      const landing = resolveLanding(seat, 0, this.seatCount, {
        jumpMode: this.jumpMode,
        flyEnabled: this.flyEnabled
      })
      const crashed = this.previewCrash(seat, landing.position)
      return {
        plane: planeIndex,
        from,
        to: landing.position,
        takeoff: true,
        effects: landing.effects,
        crashed,
        finishes: landing.position === FINISH
      }
    }

    const target = from + die
    if (target > FINISH) return null // 终点需要精确点数
    const landing = resolveLanding(seat, target, this.seatCount, {
      jumpMode: this.jumpMode,
      flyEnabled: this.flyEnabled
    })
    const crashed = this.previewCrash(seat, landing.position)
    return {
      plane: planeIndex,
      from,
      to: landing.position,
      takeoff: false,
      effects: landing.effects,
      crashed,
      finishes: landing.position === FINISH
    }
  }

  previewCrash(seat, position) {
    if (!isOnTrack(position)) return []
    const cell = absoluteCell(seat, position, this.seatCount)
    const crashed = []
    this.players.forEach((other) => {
      if (other.seat === seat) return
      other.planes.forEach((otherPosition, plane) => {
        if (!isOnTrack(otherPosition)) return
        if (absoluteCell(other.seat, otherPosition, this.seatCount) === cell)
          crashed.push({ seat: other.seat, plane })
      })
    })
    return crashed
  }

  move(playerId, planeIndex, turnSeconds = 0) {
    this.requireTurn(playerId)
    const player = this.currentPlayer()
    if (this.die === null) throw new GameError('请先掷骰')
    const preview = this.previewMove(player.seat, planeIndex, this.die)
    if (!preview) throw new GameError('该棋子无法移动')

    player.planes[planeIndex] = preview.to
    if (preview.to === FINISH) {
      this.pushLog(player.seat, `${player.nickname} 的一架飞机到家`, 'HOME')
    }
    preview.effects.forEach((effect) => {
      if (effect === 'JUMP') player.stats.jumps += 1
      if (effect === 'FLY') player.stats.flies += 1
    })
    if (preview.effects.length > 0)
      this.pushLog(
        player.seat,
        `${player.nickname} 触发${preview.effects.map((e) => (e === 'FLY' ? '飞棋' : '跳棋')).join(' + ')}`,
        'EFFECT'
      )

    preview.crashed.forEach((hit) => {
      const victim = this.players[hit.seat]
      victim.planes[hit.plane] = HANGAR
      player.stats.crashes += 1
      this.pushLog(player.seat, `${player.nickname} 撞回 ${victim.nickname} 一架飞机`, 'CRASH')
    })

    const allHome = player.planes.every((position) => position === FINISH)
    if (allHome) {
      player.rank = this.ranking.length + 1
      this.ranking.push(player.id)
      this.pushLog(player.seat, `${player.nickname} 全部飞机到家，第 ${player.rank} 名`, 'WIN')
    }

    this.legal = []
    this.version += 1

    if (this.shouldEnd()) {
      this.endGame()
      return preview
    }
    this.finishTurn(turnSeconds)
    return preview
  }

  shouldEnd() {
    const remaining = this.activePlayers()
    if (this.endOnFirst) return this.ranking.length > 0
    return remaining.length <= 1
  }

  /** 结束当前回合并交出行动权。 */
  finishTurn(turnSeconds = 0) {
    const player = this.currentPlayer()
    const extraRoll = this.die === TAKEOFF_DIE && this.streak < MAX_ROLL_STREAK && player && player.rank === null
    this.die = null
    this.legal = []
    if (extraRoll) {
      this.streak = this.streak
      this.turnState = TURN_STATE.ROLL
      this.refreshTurnDeadline(turnSeconds)
      this.version += 1
      return
    }
    this.streak = 0
    this.turnState = TURN_STATE.ROLL
    const next = this.nextSeat(this.turnSeat)
    if (next === -1) {
      this.endGame()
      return
    }
    this.turnSeat = next
    this.refreshTurnDeadline(turnSeconds)
    this.version += 1
  }

  nextSeat(fromSeat) {
    const total = this.players.length
    for (let step = 1; step <= total; step += 1) {
      const candidate = (fromSeat + step) % total
      const player = this.players[candidate]
      if (player && player.rank === null) return candidate
    }
    return -1
  }

  endGame(reason = null) {
    if (this.phase === PHASE.FINISHED) return
    this.phase = PHASE.FINISHED
    this.finishedAt = Date.now()
    this.turnDeadline = null
    this.die = null
    this.legal = []
    const ranked = this.players
      .filter((player) => player.rank !== null)
      .sort((a, b) => a.rank - b.rank)
    const rest = this.players
      .filter((player) => player.rank === null)
      .sort((a, b) => progressOf(b) - progressOf(a))
    rest.forEach((player, index) => {
      player.rank = ranked.length + index + 1
    })
    this.ranking = [...ranked, ...rest].map((player) => player.id)
    if (reason) this.pushLog(null, reason, 'SYSTEM')
    const champion = this.players.find((player) => player.rank === 1)
    if (champion && !reason) this.pushLog(champion.seat, `${champion.nickname} 获胜！`, 'WIN')
    this.version += 1
  }

  pushLog(seat, text, kind = 'INFO') {
    this.log.push({ id: randomUUID(), at: Date.now(), seat, text, kind })
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT)
  }

  requireTurn(playerId, expectedState = null) {
    if (this.phase !== PHASE.PLAYING) throw new GameError('对局未在进行中')
    const player = this.currentPlayer()
    if (!player || player.id !== playerId) throw new GameError('还没到你的回合')
    if (expectedState && this.turnState !== expectedState)
      throw new GameError(expectedState === TURN_STATE.ROLL ? '本回合已经掷过骰子' : '请先掷骰')
  }

  snapshot() {
    return {
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      phase: this.phase,
      maxPlayers: this.maxPlayers,
      planesPerPlayer: this.planesPerPlayer,
      jumpMode: this.jumpMode,
      flyEnabled: this.flyEnabled,
      endOnFirst: this.endOnFirst,
      seatCount: this.seatCount,
      turnSeat: this.turnSeat,
      turnState: this.turnState,
      die: this.die,
      streak: this.streak,
      legal: this.legal,
      turnDeadline: this.turnDeadline,
      version: this.version,
      log: this.log,
      ranking: this.ranking,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      players: this.players.map((player) => ({
        id: player.id,
        seat: player.seat,
        nickname: player.nickname,
        color: colorOf(player.seat).key,
        ai: player.ai,
        accountId: player.accountId,
        connected: player.connected,
        planes: [...player.planes],
        rank: player.rank,
        stats: { ...player.stats }
      }))
    }
  }
}

export function progressOf(player) {
  const home = player.planes.filter((position) => position === FINISH).length * 1000
  return home + player.planes.reduce((sum, position) => sum + Math.max(0, position), 0)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export class GameError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GameError'
    this.expose = true
  }
}
