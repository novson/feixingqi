import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApp } from '../src/app.js'

async function harness() {
  const app = await buildApp()
  // 测试里不等待真实时间：AI 与超时立即行动
  app.rooms.aiThinkMs = 0
  app.rooms.turnSeconds = 0
  app.rooms.awaySeconds = 0
  return { app }
}

async function post(app, url, payload) {
  const response = await app.inject({ method: 'POST', url, payload })
  assert.ok(response.statusCode < 400, `${url} 失败：${response.body}`)
  return JSON.parse(response.body)
}

test('完整一局：填昵称建房 → 开局 → 打完 → 分出名次', async () => {
  const { app } = await harness()
  try {
    const created = await post(app, '/api/rooms', {
      name: '周五约局',
      hostNickname: '小明',
      maxPlayers: 2,
      aiPlayers: 1,
      planesPerPlayer: 2
    })
    assert.match(created.room.code, /^[A-Z0-9]{4}$/)

    const started = await post(app, `/api/rooms/${created.room.id}/start`, {
      playerId: created.playerId,
      reconnectToken: created.reconnectToken
    })
    assert.equal(started.room.phase, 'PLAYING')

    let guard = 0
    let room = started.room
    while (room.phase !== 'FINISHED' && guard < 4000) {
      guard += 1
      const mine = room.players.find((player) => player.id === created.playerId)
      if (room.turnSeat !== mine.seat) {
        app.rooms.tick() // 推进 AI / 超时
      } else if (room.turnState === 'ROLL') {
        room = (await post(app, `/api/rooms/${created.room.id}/roll`, {
          playerId: created.playerId,
          reconnectToken: created.reconnectToken
        })).room
      } else if (room.turnState === 'MOVE' && room.legal.length > 0) {
        room = (await post(app, `/api/rooms/${created.room.id}/move`, {
          playerId: created.playerId,
          reconnectToken: created.reconnectToken,
          plane: room.legal[0].plane
        })).room
      } else {
        app.rooms.tick()
      }
      if (room.phase !== 'FINISHED') {
        const current = await app.inject({ method: 'GET', url: `/api/rooms/${created.room.id}` })
        room = JSON.parse(current.body).room
      }
    }
    assert.equal(room.phase, 'FINISHED')
    assert.equal(room.ranking.length, 2)
    room.players.forEach((player) => assert.ok(player.rank >= 1 && player.rank <= 2))
  } finally {
    await app.close()
  }
})

test('房间状态通过 WebSocket 推送', async () => {
  const { app } = await harness()
  const WebSocket = (await import('ws')).default
  try {
    await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address()
    const created = await post(app, '/api/rooms', {
      name: '推送测试',
      hostNickname: '小明',
      maxPlayers: 2,
      aiPlayers: 1
    })

    const states = await new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`)
      const collected = []
      const timer = setTimeout(() => resolve(collected), 2500)
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString())
        if (message.t === 'state') {
          collected.push(message.room)
          if (collected.length >= 2) {
            clearTimeout(timer)
            socket.close()
            resolve(collected)
          }
        }
      })
      socket.on('open', () => {
        socket.send(JSON.stringify({ t: 'sub', roomId: created.room.id }))
        setTimeout(() => {
          post(app, `/api/rooms/${created.room.id}/start`, {
            playerId: created.playerId,
            reconnectToken: created.reconnectToken
          }).catch(reject)
        }, 100)
      })
      socket.on('error', reject)
    })

    assert.ok(states.length >= 2, '订阅后应至少收到一次状态与一次更新')
    assert.equal(states[0].id, created.room.id)
    assert.equal(states.at(-1).phase, 'PLAYING')
  } finally {
    await app.close()
  }
})

test('接口错误返回可读的中文提示', async () => {
  const { app } = await harness()
  try {
    const missing = await app.inject({ method: 'GET', url: '/api/rooms/not-exist' })
    assert.equal(missing.statusCode, 400)
    assert.match(JSON.parse(missing.body).error, /房间不存在/)

    const badToken = await app.inject({
      method: 'POST',
      url: '/api/rooms/not-exist/join',
      payload: { nickname: '小红' }
    })
    assert.equal(badToken.statusCode, 400)

    const noNickname = await app.inject({ method: 'POST', url: '/api/rooms', payload: { name: '没昵称' } })
    assert.equal(noNickname.statusCode, 400)
    assert.match(JSON.parse(noNickname.body).error, /昵称/)
  } finally {
    await app.close()
  }
})
