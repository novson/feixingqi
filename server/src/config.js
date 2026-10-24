import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
export const serverRoot = join(here, '..')

function number(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const config = {
  port: number(process.env.PORT, 8080),
  host: process.env.HOST || '0.0.0.0',
  allowedOrigins: (process.env.FLY_ALLOWED_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  turnSeconds: number(process.env.FLY_TURN_SECONDS, 25),
  aiThinkMs: number(process.env.FLY_AI_THINK_MS, 900),
  awaySeconds: number(process.env.FLY_AWAY_SECONDS, 5),
  tickMs: number(process.env.FLY_TICK_MS, 500),
  webDist: process.env.FLY_WEB_DIST || join(serverRoot, '..', 'web', 'dist')
}
