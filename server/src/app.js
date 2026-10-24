import { existsSync } from 'node:fs'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import { config } from './config.js'
import { GameError } from './game.js'
import { createHub } from './hub.js'
import { RoomManager } from './rooms.js'

export async function buildApp(options = {}) {
  const app = Fastify({ logger: options.logger ?? false })
  const hub = options.hub || createHub()
  const rooms =
    options.rooms ||
    new RoomManager({
      turnSeconds: config.turnSeconds,
      aiThinkMs: config.aiThinkMs,
      awaySeconds: config.awaySeconds,
      onChange: (roomId, snapshot) => hub.broadcast(roomId, snapshot)
    })

  await app.register(cors, { origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins })
  await app.register(websocket)

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof GameError || error.expose) return reply.code(400).send({ error: error.message })
    if (error.validation) return reply.code(400).send({ error: '请求参数不正确' })
    request.log?.error?.(error)
    return reply.code(500).send({ error: '服务器开小差了' })
  })

  // ---------- 房间 ----------
  app.get('/api/rooms', async () => ({ rooms: rooms.listRooms() }))

  app.post('/api/rooms', async (request, reply) => {
    const { game, player } = rooms.createRoom(request.body || {})
    return reply.code(201).send({
      room: rooms.summary(game),
      playerId: player.id,
      reconnectToken: player.reconnectToken
    })
  })

  app.get('/api/rooms/:roomId', async (request) => {
    const game = rooms.require(request.params.roomId)
    return { room: game.snapshot() }
  })

  app.post('/api/rooms/:roomId/join', async (request) => {
    const body = request.body || {}
    const { game, player } = rooms.joinRoom(request.params.roomId, { nickname: body.nickname })
    return {
      room: game.snapshot(),
      playerId: player.id,
      reconnectToken: player.reconnectToken
    }
  })

  app.post('/api/rooms/:roomId/ai', async (request) => {
    const body = request.body || {}
    const game = rooms.setAiPlayers(request.params.roomId, body.playerId, body.reconnectToken, body.count)
    return { room: game.snapshot() }
  })

  app.post('/api/rooms/:roomId/start', async (request) => {
    const body = request.body || {}
    const game = rooms.startRoom(request.params.roomId, body.playerId, body.reconnectToken)
    return { room: game.snapshot() }
  })

  app.post('/api/rooms/:roomId/roll', async (request) => {
    const body = request.body || {}
    const game = rooms.roll(request.params.roomId, body.playerId, body.reconnectToken)
    return { room: game.snapshot() }
  })

  app.post('/api/rooms/:roomId/move', async (request) => {
    const body = request.body || {}
    const game = rooms.move(request.params.roomId, body.playerId, body.reconnectToken, body.plane)
    return { room: game.snapshot() }
  })

  app.post('/api/rooms/:roomId/leave', async (request) => {
    const body = request.body || {}
    return rooms.leaveRoom(request.params.roomId, body.playerId, body.reconnectToken)
  })

  app.post('/api/rooms/:roomId/resume', async (request) => {
    const body = request.body || {}
    const { game } = rooms.resume(request.params.roomId, body.playerId, body.reconnectToken)
    return { room: game.snapshot() }
  })

  app.get('/api/health', async () => ({ ok: true, rooms: rooms.rooms.size }))

  // ---------- 实时推送 ----------
  app.get('/ws', { websocket: true }, (socket) => {
    socket.meta = null
    socket.send(JSON.stringify({ t: 'hello' }))
    socket.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (message.t === 'sub' && message.roomId) {
        const roomId = String(message.roomId)
        hub.subscribe(roomId, socket)
        const game = rooms.getRoom(roomId)
        if (game) socket.send(JSON.stringify({ t: 'state', room: game.snapshot() }))
      } else if (message.t === 'unsub' && message.roomId) {
        hub.unsubscribe(String(message.roomId), socket)
      } else if (message.t === 'presence' && message.playerId) {
        const player = rooms.setConnected(
          message.roomId,
          message.playerId,
          message.reconnectToken,
          message.connected !== false
        )
        if (player)
          socket.meta = { roomId: String(message.roomId), playerId: player.id, token: message.reconnectToken }
      }
    })
    socket.on('close', () => {
      if (socket.meta) rooms.setConnected(socket.meta.roomId, socket.meta.playerId, socket.meta.token, false)
      hub.unsubscribeAll(socket)
    })
  })

  // ---------- 生产静态资源 ----------
  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: '/' })
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws'))
        return reply.code(404).send({ error: '接口不存在' })
      return reply.sendFile('index.html')
    })
  }

  app.decorate('rooms', rooms)
  app.decorate('hub', hub)
  return app
}
