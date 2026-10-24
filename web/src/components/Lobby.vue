<script setup>
import { computed, reactive, ref } from 'vue'
import { MAX_PLAYERS, MIN_PLAYERS } from '../services/rules.js'

const props = defineProps({
  rooms: { type: Array, default: () => [] },
  activeRoom: { type: Object, default: null },
  busy: { type: Boolean, default: false }
})

const emit = defineEmits(['refresh', 'create', 'enter', 'join-code'])

const form = reactive({
  name: '',
  maxPlayers: 4,
  planesPerPlayer: 4,
  aiPlayers: 1,
  jumpMode: 'AUTO',
  flyEnabled: true,
  endOnFirst: true
})

const code = ref('')

const aiOptions = computed(() => {
  const limit = Math.max(0, form.maxPlayers - 1)
  return Array.from({ length: limit + 1 }, (_, index) => index)
})

function create() {
  emit('create', { ...form })
}

function joinByCode() {
  const value = String(code.value || '')
    .toUpperCase()
    .trim()
  if (!value) return
  emit('join-code', value)
}

function phaseLabel(phase) {
  if (phase === 'PLAYING') return '进行中'
  if (phase === 'FINISHED') return '已结束'
  return '等待开始'
}
</script>

<template>
  <div class="grid lobby">
    <div v-if="props.activeRoom" class="card notice-card">
      <div class="row">
        <strong>你还在房间「{{ props.activeRoom.room.name }}」</strong>
        <span class="tag">{{ phaseLabel(props.activeRoom.room.phase) }}</span>
        <span class="spacer"></span>
        <button @click="emit('enter', props.activeRoom.roomId)">回到房间</button>
      </div>
    </div>

    <div class="lobby-grid">
      <section class="card">
        <h2>开一局</h2>
        <p class="muted small">建好后把房间码发给朋友，人数不够可以让 AI 补位。</p>
        <div class="form-grid">
          <div>
            <label for="room-name">房间名</label>
            <input id="room-name" v-model="form.name" maxlength="30" placeholder="周五约局" />
          </div>
          <div>
            <label for="max-players">最多几人</label>
            <select id="max-players" v-model.number="form.maxPlayers">
              <option v-for="count in MAX_PLAYERS - MIN_PLAYERS + 1" :key="count" :value="count + MIN_PLAYERS - 1">
                {{ count + MIN_PLAYERS - 1 }} 人
              </option>
            </select>
          </div>
          <div>
            <label for="planes">每人几架飞机</label>
            <select id="planes" v-model.number="form.planesPerPlayer">
              <option :value="2">2 架（快）</option>
              <option :value="3">3 架</option>
              <option :value="4">4 架（经典）</option>
            </select>
          </div>
          <div>
            <label for="ai">AI 对手</label>
            <select id="ai" v-model.number="form.aiPlayers">
              <option v-for="count in aiOptions" :key="count" :value="count">{{ count }} 个</option>
            </select>
          </div>
          <div>
            <label for="jump">跳棋距离</label>
            <select id="jump" v-model="form.jumpMode">
              <option value="AUTO">自动（等于人数，4 人即 4 格）</option>
              <option value="CLASSIC4">固定 4 格</option>
            </select>
          </div>
          <div>
            <label for="finish">结束方式</label>
            <select id="finish" v-model="form.endOnFirst">
              <option :value="true">第一个全部到家即结束</option>
              <option :value="false">打到只剩一人未到家</option>
            </select>
          </div>
        </div>
        <div class="row switches">
          <label class="switch">
            <input v-model="form.flyEnabled" type="checkbox" />
            <span>开启飞棋（飞机场跨半圈）</span>
          </label>
        </div>
        <button :disabled="props.busy" @click="create">创建房间</button>
      </section>

      <section class="card">
        <div class="row">
          <h2>房间列表</h2>
          <span class="spacer"></span>
          <button class="ghost" @click="emit('refresh')">刷新</button>
        </div>

        <div class="row join">
          <input v-model="code" maxlength="4" placeholder="输入 4 位房间码" @keyup.enter="joinByCode" />
          <button class="subtle" @click="joinByCode">加入</button>
        </div>

        <ul class="rooms">
          <li v-for="room in props.rooms" :key="room.id">
            <div>
              <div class="row title">
                <strong>{{ room.name }}</strong>
                <span class="tag">{{ phaseLabel(room.phase) }}</span>
                <span class="code-tag">{{ room.code }}</span>
              </div>
              <div class="muted small">
                {{ room.humans }} 人 · AI {{ room.ais }} · 上限 {{ room.maxPlayers }} · {{ room.planesPerPlayer }} 架/人
                <span v-if="room.jumpMode === 'CLASSIC4'"> · 跳棋固定 4 格</span>
                <span v-if="!room.flyEnabled"> · 无飞棋</span>
              </div>
            </div>
            <button
              class="ghost"
              :disabled="props.busy || room.phase !== 'LOBBY' || room.humans + room.ais >= room.maxPlayers"
              @click="emit('enter', room.id)"
            >
              {{ room.phase === 'PLAYING' ? '观战' : '进入' }}
            </button>
          </li>
          <li v-if="props.rooms.length === 0" class="muted small empty">还没有房间，创建一个吧。</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.lobby-grid {
  display: grid;
  grid-template-columns: minmax(300px, 380px) 1fr;
  gap: 14px;
  align-items: start;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 14px 0;
}

.switches {
  margin-bottom: 14px;
}

.switch {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink);
  font-size: 13px;
  margin: 0;
}

.switch input {
  width: auto;
}

.join {
  margin: 12px 0;
}

.join input {
  width: 160px;
  text-transform: uppercase;
}

.rooms {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.rooms li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.rooms li > div:first-child {
  flex: 1;
}

.title {
  gap: 8px;
}

.code-tag {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1px 6px;
}

.empty {
  border: none;
}

@media (max-width: 860px) {
  .lobby-grid {
    grid-template-columns: 1fr;
  }
}
</style>
