import { buildApp } from './app.js'
import { config } from './config.js'

const app = await buildApp({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'production' ? undefined : undefined
  }
})

const ticker = setInterval(() => {
  try {
    app.rooms.tick()
  } catch (error) {
    app.log.error(error)
  }
}, config.tickMs)
ticker.unref?.()

const shutdown = async (signal) => {
  app.log.info(`收到 ${signal}，正在关闭`)
  clearInterval(ticker)
  try {
    await app.close()
  } finally {
    process.exit(0)
  }
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

try {
  await app.listen({ port: config.port, host: config.host })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
