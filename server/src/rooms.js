import { randomUUID } from 'node:crypto'
import { chooseMove } from './ai.js'
import { Game, GameError, PHASE, TURN_STATE } from './game.js'
import { DEFAULT_PLANES, MAX_PLAYERS, MIN_PLAYERS } from './rules.js'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const FINISHED_ROOM_TTL = 10 * 60 * 1000
const IDLE_ROOM_TTL = 3 * 60 * 60 * 1000

/**
 * 房间与对局的编排层：负责建房间、入座、开局、回合推进、AI 托管、
 * 超时自动行动与断线恢复。玩家凭昵称入座，座位身份用 playerId + reconnectToken 维持。
 */
export class RoomManager {
  constructor({ turnSeconds = 25, aiThinkMs = 900, awaySeconds = 5, onChange = () => {} } = {}) {
    this.rooms = new Map()
    this.turnSeconds = turnSeconds
    this.aiThinkMs = aiThinkMs
    this.awaySeconds = awaySeconds
    this.onChange = onChange
  }

  createRoom(options = {}) {
    const game = new Game({
      name: normalizeName(options.name),
      maxPlayers: clampInt(options.maxPlayers, MIN_PLAYERS, MAX_PLAYERS, 4),
      planesPerPlayer: clampInt(options.planesPerPlayer, 1, 6, DEFAULT_PLANES),
      jumpMode: options.jumpMode === 'CLASSIC4' ? 'CLASSIC4' : 'AUTO',
      flyEnabled: options.flyEnabled !== false,
      endOnFirst: options.endOnFirst !== false
    })
    const host = game.addPlayer({ nickname: normalizeNickname(options.hostNickname) })
    game.code = this.nextCode()
    this.rooms.set(game.id, game)
    this.addAiPlayers(game, clampInt(options.aiPlayers, 0, MAX_PLAYERS - 1, 0))
    this.notify(game)
    return { game, player: host }
  }

  listRooms() {
    return [...this.rooms.values()]
      .filter((game) => game.phase !== PHASE.FINISHED || Date.now() - (game.finishedAt || 0) < FINISHED_ROOM_TTL)
      .sort((a, b) => rankPhase(a) - rankPhase(b) || b.createdAt - a.createdAt)
      .map((game) => this.summary(game))
  }

  summary(game) {
    return {
      id: game.id,
      code: game.code,
      name: game.name,
      phase: game.phase,
      maxPlayers: game.maxPlayers,
      seatCount: game.seatCount,
      humans: game.players.filter((player) => !player.ai).length,
      ais: game.players.filter((player) => player.ai).length,
      planesPerPlayer: game.planesPerPlayer,
      jumpMode: game.jumpMode,
      flyEnabled: game.flyEnabled,
      endOnFirst: game.endOnFirst,
      hostNickname: game.players.find((player) => player.id === game.hostId)?.nickname || '',
      version: game.version,
      updatedAt: game.startedAt || game.createdAt
    }
  }

  getRoom(roomIdOrCode) {
    const key = String(roomIdOrCode || '')
    const byId = this.rooms.get(key)
    if (byId) return byId
    return [...this.rooms.values()].find((game) => game.code === key.toUpperCase()) || null
  }

  joinRoom(roomId, { nickname }) {
    const game = this.require(roomId)
    if (game.players.length >= game.maxPlayers) throw new GameError('房间已满')
    const player = game.addPlayer({ nickname: normalizeNickname(nickname) })
    this.notify(game)
    return { game, player, resumed: false }
  }

  /** 房主在大厅里增减 AI 对手。 */
  setAiPlayers(roomId, playerId, token, count) {
    const game = this.require(roomId)
    this.requireHost(game, playerId, token)
    if (game.phase !== PHASE.LOBBY) throw new GameError('对局已开始，无法调整 AI')
    const humans = game.players.filter((player) => !player.ai).length
    const wanted = clampInt(count, 0, Math.max(0, game.maxPlayers - humans), 0)
    const current = game.players.filter((player) => player.ai).length
    if (wanted > current) this.addAiPlayers(game, wanted - current)
    if (wanted < current) {
      let remove = current - wanted
      for (let index = game.players.length - 1; index >= 0 && remove > 0; index -= 1) {
        if (game.players[index].ai) {
          game.players.splice(index, 1)
          remove -= 1
        }
      }
      game.players.forEach((player, seat) => {
        player.seat = seat
      })
      game.version += 1
    }
    this.notify(game)
    return game
  }

  startRoom(roomId, playerId, token) {
    const game = this.require(roomId)
    this.requireHost(game, playerId, token)
    if (game.players.length < MIN_PLAYERS) throw new GameError(`至少需要 ${MIN_PLAYERS} 位玩家`)
    if (game.players.length < game.maxPlayers && game.players.every((player) => !player.ai))
      throw new GameError('还有空位，可以再加人或让 AI 补位')
    game.start()
    this.resetTurnClock(game)
    this.notify(game)
    return game
  }

  roll(roomId, playerId, token) {
    const game = this.require(roomId)
    const player = this.authenticatePlayer(game, playerId, token)
    if (player.ai) throw new GameError('该座位由 AI 托管')
    game.roll(player.id, 0)
    this.resetTurnClock(game)
    this.afterAction(game)
    return game
  }

  move(roomId, playerId, token, planeIndex) {
    const game = this.require(roomId)
    const player = this.authenticatePlayer(game, playerId, token)
    if (player.ai) throw new GameError('该座位由 AI 托管')
    game.move(player.id, Number(planeIndex), 0)
    this.resetTurnClock(game)
    this.afterAction(game)
    return game
  }

  leaveRoom(roomId, playerId, token) {
    const game = this.require(roomId)
    const player = this.authenticatePlayer(game, playerId, token)
    if (game.phase === PHASE.LOBBY) {
      game.removePlayer(player.id)
      if (game.players.length === 0) {
        this.rooms.delete(game.id)
        return { removed: true, deleted: true }
      }
      this.notify(game)
      return { removed: true, deleted: false }
    }
    if (game.phase === PHASE.PLAYING) {
      player.ai = true
      player.connected = false
      game.pushLog(player.seat, `${player.nickname} 离开，本座位由 AI 托管`, 'SYSTEM')
      game.version += 1
      const humans = game.players.filter((candidate) => !candidate.ai)
      if (humans.length === 0) {
        game.endGame('所有玩家已离开')
        this.rooms.delete(game.id)
        return { removed: false, deleted: true }
      }
      this.resetTurnClock(game)
      this.notify(game)
      return { removed: false, deleted: false,托管: true }
    }
    this.rooms.delete(game.id)
    return { removed: false, deleted: true }
  }

  resume(roomId, playerId, token) {
    const game = this.require(roomId)
    const player = this.authenticatePlayer(game, playerId, token)
    player.connected = true
    if (player.ai && game.phase === PHASE.LOBBY) player.ai = false
    game.version += 1
    this.notify(game)
    return { game, player }
  }

  /** 用 playerId + reconnectToken 找回自己的座位（刷新或断线后使用）。 */
  findSeat(roomId, playerId, token) {
    const game = this.getRoom(roomId)
    if (!game) return null
    const player = game.players.find((candidate) => candidate.id === playerId)
    if (!player || player.reconnectToken !== token) return null
    return { game, player }
  }

  setConnected(roomId, playerId, token, connected) {
    const game = this.rooms.get(String(roomId))
    if (!game) return null
    const player = game.players.find((candidate) => candidate.id === playerId)
    if (!player || player.reconnectToken !== token) return null
    if (player.connected !== connected) {
      player.connected = connected
      game.version += 1
      this.notify(game)
    }
    return player
  }

  /** 每 500ms 由定时器调用：推进 AI 回合、处理超时、回收过期房间。 */
  tick() {
    const now = Date.now()
    for (const game of [...this.rooms.values()]) {
      if (game.phase === PHASE.PLAYING) {
        const deadline = game.turnDeadline || 0
        if (now >= deadline) {
          try {
            this.autoAct(game)
          } catch (error) {
            game.pushLog(null, `自动推进失败：${error.message}`, 'SYSTEM')
          }
          this.afterAction(game)
        }
        continue
      }
      const idleFor = now - (game.finishedAt || game.createdAt)
      if (game.phase === PHASE.FINISHED && idleFor > FINISHED_ROOM_TTL) this.rooms.delete(game.id)
      else if (game.phase === PHASE.LOBBY && idleFor > IDLE_ROOM_TTL) this.rooms.delete(game.id)
    }
  }

  autoAct(game) {
    const player = game.currentPlayer()
    if (!player) return
    if (game.turnState === TURN_STATE.ROLL) {
      game.roll(player.id, 0)
    } else {
      const legal = game.legal
      if (legal.length === 0) {
        game.finishTurn(0)
        return
      }
      const plane = chooseMove(game, player.seat, legal)
      game.move(player.id, plane == null ? legal[0].plane : plane, 0)
    }
    this.resetTurnClock(game)
  }

  resetTurnClock(game) {
    if (game.phase !== PHASE.PLAYING) return
    const player = game.currentPlayer()
    if (!player) return
    const wait = player.ai ? this.aiThinkMs / 1000 : player.connected ? this.turnSeconds : this.awaySeconds
    game.refreshTurnDeadline(wait)
  }

  afterAction(game) {
    this.notify(game)
  }

  addAiPlayers(game, count) {
    for (let index = 0; index < count; index += 1) {
      if (game.players.length >= game.maxPlayers) break
      game.addPlayer({ nickname: `AI ${index + 1}`, ai: true })
    }
  }

  notify(game) {
    this.onChange(game.id, game.snapshot())
  }

  require(roomId) {
    const game = this.getRoom(roomId)
    if (!game) throw new GameError('房间不存在或已结束')
    return game
  }

  authenticatePlayer(game, playerId, token) {
    const player = game.players.find((candidate) => candidate.id === playerId)
    if (!player) throw new GameError('座位不存在')
    if (!token || player.reconnectToken !== token) throw new GameError('座位身份已失效，请重新进入房间')
    return player
  }

  requireHost(game, playerId, token) {
    const player = this.authenticatePlayer(game, playerId, token)
    if (game.hostId !== player.id) throw new GameError('只有房主可以操作')
    return player
  }

  nextCode() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = ''
      for (let index = 0; index < 4; index += 1)
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      const clash = [...this.rooms.values()].some((game) => game.code === code)
      if (!clash) return code
    }
    return randomUUID().slice(0, 4).toUpperCase()
  }
}

function rankPhase(game) {
  if (game.phase === PHASE.PLAYING) return 0
  if (game.phase === PHASE.LOBBY) return 1
  return 2
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function normalizeNickname(raw) {
  const nickname = String(raw || '').trim()
  if (nickname.length < 1 || nickname.length > 16) throw new GameError('昵称需要 1–16 个字符')
  return nickname
}

function normalizeName(raw) {
  const name = String(raw || '').trim() || '飞行棋房间'
  return name.slice(0, 30)
}
