<script setup>
import { computed, onMounted, ref } from 'vue'
import Lobby from './components/Lobby.vue'
import NicknameGate from './components/NicknameGate.vue'
import RoomView from './components/RoomView.vue'
import { api } from './services/api.js'
import { clearNickname, readNickname, saveNickname } from './services/nickname.js'
import { clearSession, readSession, saveSession } from './services/session.js'

const nickname = ref(readNickname())
const session = ref(readSession())
const rooms = ref([])
const view = ref('lobby')
const busy = ref(false)
const error = ref('')
const notice = ref('')

const resumable = computed(() => (session.value?.playerId ? session.value : null))

async function refreshRooms() {
  try {
    rooms.value = (await api.listRooms()).rooms
  } catch (failure) {
    error.value = failure.message
  }
}

function onNickname(value) {
  nickname.value = saveNickname(value)
  error.value = ''
  view.value = 'lobby'
  refreshRooms()
}

function changeNickname() {
  clearNickname()
  nickname.value = null
  view.value = 'lobby'
}

async function createRoom(payload) {
  busy.value = true
  error.value = ''
  try {
    const result = await api.createRoom({ ...payload, hostNickname: nickname.value })
    session.value = saveSession({
      roomId: result.room.id,
      playerId: result.playerId,
      reconnectToken: result.reconnectToken,
      roomName: result.room.name
    })
    view.value = 'room'
  } catch (failure) {
    error.value = failure.message
  } finally {
    busy.value = false
  }
}

async function enterRoom(roomId) {
  busy.value = true
  error.value = ''
  try {
    const known = session.value?.roomId === roomId ? session.value : null
    if (known?.playerId) {
      await api.resume(roomId, { playerId: known.playerId, reconnectToken: known.reconnectToken })
      session.value = saveSession({ ...known, roomId })
      view.value = 'room'
      return
    }
    const { room: snapshot } = await api.getRoom(roomId)
    if (snapshot.phase === 'LOBBY') {
      const result = await api.joinRoom(roomId, { nickname: nickname.value })
      session.value = saveSession({
        roomId,
        playerId: result.playerId,
        reconnectToken: result.reconnectToken,
        roomName: result.room.name
      })
    } else {
      // 对局已经开始，只能观战
      session.value = saveSession({ roomId, playerId: '', reconnectToken: '', roomName: snapshot.name })
    }
    view.value = 'room'
  } catch (failure) {
    error.value = failure.message
  } finally {
    busy.value = false
  }
}

async function joinByCode(code) {
  busy.value = true
  error.value = ''
  try {
    const list = (await api.listRooms()).rooms
    const room = list.find((item) => item.code === code)
    if (!room) {
      error.value = `找不到房间码 ${code}`
      return
    }
    await enterRoom(room.id)
  } catch (failure) {
    error.value = failure.message
  } finally {
    busy.value = false
  }
}

function onLeft() {
  clearSession()
  session.value = null
  view.value = 'lobby'
  refreshRooms()
}

function onRoomFailed() {
  clearSession()
  session.value = null
  view.value = 'lobby'
  error.value = '房间已不存在或已结束'
  refreshRooms()
}

onMounted(async () => {
  await refreshRooms()
  if (!session.value?.playerId) {
    if (session.value) clearSession()
    session.value = null
    return
  }
  // 上次还在房间里，先确认房间是否还在
  try {
    await api.resume(session.value.roomId, {
      playerId: session.value.playerId,
      reconnectToken: session.value.reconnectToken
    })
    view.value = 'room'
    notice.value = '已回到上次的房间'
  } catch {
    clearSession()
    session.value = null
  }
})
</script>

<template>
  <div class="app">
    <header v-if="nickname" class="row topbar">
      <div class="brand">✈️ 在线飞行棋</div>
      <span class="spacer"></span>
      <span class="small muted">{{ nickname }}</span>
      <button class="ghost" @click="changeNickname">换个昵称</button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>

    <NicknameGate v-if="!nickname" @done="onNickname" />

    <RoomView
      v-else-if="view === 'room' && session"
      :key="session.roomId"
      :room-id="session.roomId"
      :session="session"
      @left="onLeft"
      @failed="onRoomFailed"
    />

    <Lobby
      v-else
      :rooms="rooms"
      :resumable="resumable"
      :busy="busy"
      @refresh="refreshRooms"
      @create="createRoom"
      @enter="enterRoom"
      @join-code="joinByCode"
    />
  </div>
</template>

<style scoped>
.topbar {
  margin-bottom: 14px;
}

.brand {
  font-size: 18px;
  font-weight: 700;
}

.error,
.notice {
  margin: 0 0 12px;
}
</style>
