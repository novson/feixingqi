<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameBoard from './GameBoard.vue'
import { api, seatCommand } from '../services/api.js'
import { connectRoom } from '../services/socket.js'
import { FINISH, colorOf } from '../services/rules.js'

const props = defineProps({
  roomId: { type: String, required: true },
  session: { type: Object, required: true },
  account: { type: Object, default: null }
})

const emit = defineEmits(['left', 'failed'])

const room = ref(null)
const status = ref('connecting')
const error = ref('')
const busy = ref(false)
const now = ref(Date.now())
const socket = ref(null)
let ticker = null

const PIP_LAYOUT = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72]
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72]
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72]
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72]
  ],
  6: [
    [28, 28],
    [72, 28],
    [28, 50],
    [72, 50],
    [28, 72],
    [72, 72]
  ]
}

const me = computed(() => room.value?.players.find((player) => player.id === props.session.playerId) || null)
const isSpectator = computed(() => !me.value)
const isHost = computed(() => !!me.value && room.value?.hostId === me.value.id)
const isMyTurn = computed(() => !!me.value && room.value?.phase === 'PLAYING' && room.value.turnSeat === me.value.seat)
const canRoll = computed(() => isMyTurn.value && room.value.turnState === 'ROLL')
const canMove = computed(() => isMyTurn.value && room.value.turnState === 'MOVE' && room.value.legal.length > 0)
const interactive = computed(() => canMove.value)
const currentPlayer = computed(() => room.value?.players.find((player) => player.seat === room.value.turnSeat) || null)
const pips = computed(() => PIP_LAYOUT[room.value?.die] || [])
const logs = computed(() => (room.value?.log || []).slice(-8).reverse())
const aiCount = computed(() => room.value?.players.filter((player) => player.ai).length || 0)
const humans = computed(() => room.value?.players.filter((player) => !player.ai).length || 0)

const countdown = computed(() => {
  if (!room.value?.turnDeadline || room.value.phase !== 'PLAYING') return null
  return Math.max(0, Math.ceil((room.value.turnDeadline - now.value) / 1000))
})

function command(extra = {}) {
  return seatCommand(props.session.playerId, props.session.reconnectToken, extra)
}

async function run(action) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await action()
    if (result?.room) room.value = result.room
  } catch (failure) {
    error.value = failure.message
    if (/房间不存在|座位/.test(failure.message)) emit('failed', failure.message)
  } finally {
    busy.value = false
  }
}

function startGame() {
  run(() => api.start(props.roomId, command()))
}

function rollDice() {
  run(() => api.roll(props.roomId, command()))
}

function pickPlane(plane) {
  run(() => api.move(props.roomId, command({ plane })))
}

function setAi(count) {
  run(() => api.setAi(props.roomId, command({ count })))
}

async function leaveRoom() {
  if (me.value) {
    try {
      await api.leave(props.roomId, command())
    } catch (failure) {
      error.value = failure.message
    }
  }
  emit('left')
}

function homeCount(player) {
  return player.planes.filter((position) => position === FINISH).length
}

function phaseLabel(phase) {
  if (phase === 'PLAYING') return '进行中'
  if (phase === 'FINISHED') return '已结束'
  return '等待开始'
}

function statusLabel() {
  if (status.value === 'online') return '实时同步中'
  if (status.value === 'connecting') return '连接中…'
  return '连接断开，正在重连'
}

onMounted(async () => {
  try {
    const { room: snapshot } = await api.getRoom(props.roomId)
    room.value = snapshot
  } catch (failure) {
    emit('failed', failure.message)
    return
  }
  socket.value = connectRoom({
    roomId: props.roomId,
    playerId: props.session.playerId || null,
    reconnectToken: props.session.reconnectToken || null,
    onState: (snapshot) => {
      room.value = snapshot
    },
    onStatus: (value) => {
      status.value = value
    }
  })
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 500)
})

onBeforeUnmount(() => {
  clearInterval(ticker)
  socket.value?.close()
})
</script>

<template>
  <div v-if="room" class="room">
    <div class="room-grid">
      <section class="card board-card">
        <GameBoard :room="room" :my-player-id="session.playerId" :interactive="interactive" @pick="pickPlane" />
      </section>

      <aside class="grid side">
        <section class="card">
          <div class="row">
            <h2>{{ room.name }}</h2>
            <span class="tag">{{ phaseLabel(room.phase) }}</span>
            <span class="spacer"></span>
            <button class="ghost" @click="leaveRoom">离开</button>
          </div>
          <div class="muted small">
            房间码 <strong>{{ room.code }}</strong> · {{ humans }} 人 + AI {{ aiCount }} · {{ room.planesPerPlayer }} 架/人
          </div>
          <div class="row status-line">
            <span :class="['dot', status === 'online' ? 'on' : 'off']"></span>
            <span class="small muted">{{ statusLabel() }}</span>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section class="card">
          <h3>座位</h3>
          <ul class="seats">
            <li v-for="player in room.players" :key="player.id" :class="{ active: currentPlayer && currentPlayer.id === player.id }">
              <span class="dot-color" :style="{ background: colorOf(player.seat).hex }"></span>
              <div class="seat-main">
                <div class="row">
                  <strong>{{ player.nickname }}</strong>
                  <span v-if="player.ai" class="tag">AI</span>
                  <span v-if="!player.connected && !player.ai" class="tag off">离线</span>
                  <span v-if="player.id === session.playerId" class="tag me">我</span>
                  <span v-if="player.rank" class="tag rank">第 {{ player.rank }}</span>
                </div>
                <div class="muted small">到家 {{ homeCount(player) }}/{{ room.planesPerPlayer }}</div>
              </div>
            </li>
          </ul>
        </section>

        <section class="card action-card">
          <div v-if="room.phase === 'LOBBY'">
            <h3>等待开始</h3>
            <p class="muted small">房主可以调整 AI 数量并开始对局。</p>
            <div v-if="isHost" class="row ai-row">
              <label class="small" for="ai-count">AI 数量</label>
              <select
                id="ai-count"
                :value="aiCount"
                @change="setAi(Number($event.target.value))"
              >
                <option v-for="count in room.maxPlayers - humans + 1" :key="count" :value="count - 1">
                  {{ count - 1 }}
                </option>
              </select>
            </div>
            <button v-if="isHost" :disabled="busy" @click="startGame">开始游戏</button>
            <p v-else class="muted small">等待房主开始…</p>
          </div>

          <div v-else-if="room.phase === 'PLAYING'" class="play">
            <div class="row dice-row">
              <svg viewBox="0 0 100 100" class="dice" :class="{ rolling: !room.die }">
                <rect x="4" y="4" width="92" height="92" rx="18" fill="#fff" stroke="#e5e8ef" stroke-width="2" />
                <circle v-for="(pip, index) in pips" :key="index" :cx="pip[0]" :cy="pip[1]" r="9" fill="#1f2430" />
              </svg>
              <div>
                <div class="small muted">
                  当前：<strong>{{ currentPlayer ? currentPlayer.nickname : '—' }}</strong>
                </div>
                <div class="small muted">
                  {{ canRoll ? '轮到你掷骰' : canMove ? '请选择要走的飞机' : `等待 ${currentPlayer ? currentPlayer.nickname : '对手'} 行动` }}
                  <span v-if="countdown !== null"> · {{ countdown }}s</span>
                </div>
              </div>
            </div>
            <div class="row">
              <button v-if="canRoll" :disabled="busy" @click="rollDice">掷骰子</button>
              <span v-else-if="canMove" class="small muted">点击棋盘上闪烁的飞机</span>
              <span v-else-if="isSpectator" class="small muted">观战中</span>
              <span v-else class="small muted">等待其他玩家…</span>
            </div>
            <div v-if="room.streak > 0" class="small muted">本回合已连续 {{ room.streak }} 次 6 点</div>
          </div>

          <div v-else class="result">
            <h3>本局结束</h3>
            <ol class="rank">
              <li v-for="player in [...room.players].sort((a, b) => (a.rank || 99) - (b.rank || 99))" :key="player.id">
                <span class="dot-color" :style="{ background: colorOf(player.seat).hex }"></span>
                第 {{ player.rank }} 名 · {{ player.nickname }} · 到家 {{ homeCount(player) }}/{{ room.planesPerPlayer }}
              </li>
            </ol>
            <button class="ghost" @click="leaveRoom">返回大厅</button>
          </div>
        </section>

        <section class="card">
          <h3>战况</h3>
          <ul class="log">
            <li v-for="entry in logs" :key="entry.id" class="small">
              <span class="muted">{{ new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
              {{ entry.text }}
            </li>
            <li v-if="logs.length === 0" class="small muted">还没有动静。</li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.room-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: start;
}

.side {
  gap: 12px;
}

.status-line {
  margin-top: 8px;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
}

.dot.on {
  background: var(--ok);
}

.dot.off {
  background: var(--danger);
}

.seats {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.seats li {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.seats li.active {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.seat-main {
  flex: 1;
}

.dot-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: 0 0 12px;
}

.tag.off {
  background: #fdecec;
  color: var(--danger);
}

.tag.me {
  background: #eaf6ef;
  color: #1f7a4d;
}

.tag.rank {
  background: #fff4d6;
  color: #a05a00;
}

.ai-row {
  margin: 10px 0;
  gap: 8px;
}

.ai-row select {
  width: 90px;
}

.dice-row {
  gap: 12px;
  margin-bottom: 12px;
}

.dice {
  width: 64px;
  height: 64px;
}

.dice.rolling {
  animation: shake 0.5s ease-in-out infinite;
}

@keyframes shake {
  0%,
  100% {
    transform: rotate(-4deg);
  }
  50% {
    transform: rotate(4deg);
  }
}

.rank {
  margin: 10px 0 14px;
  padding-left: 20px;
  display: grid;
  gap: 6px;
}

.rank li {
  display: flex;
  gap: 8px;
  align-items: center;
}

.log {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 6px;
  max-height: 220px;
  overflow: auto;
}

.log li {
  display: flex;
  gap: 8px;
}

@media (max-width: 980px) {
  .room-grid {
    grid-template-columns: 1fr;
  }
}
</style>
