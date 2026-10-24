<script setup>
import { onMounted, ref } from 'vue'
import AuthPanel from './components/AuthPanel.vue'
import Lobby from './components/Lobby.vue'
import ProfilePanel from './components/ProfilePanel.vue'
import RoomView from './components/RoomView.vue'
import { api } from './services/api.js'
import { clearAccount, readAccount, saveAccount } from './services/account.js'
import { clearSession, readSession, saveSession } from './services/session.js'

const account = ref(readAccount())
const session = ref(readSession())
const rooms = ref([])
const activeRoom = ref(null)
const view = ref('lobby')
const busy = ref(false)
const error = ref('')
const notice = ref('')

async function refreshRooms() {
  try {
    rooms.value = (await api.listRooms()).rooms
  } catch (failure) {
    error.value = failure.message
  }
}

async function refreshActiveRoom() {
  if (!account.value) return
  try {
    activeRoom.value = await api.activeRoom(account.value.accountId, account.value.accountToken)
  } catch {
    activeRoom.value = null
  }
}

function onAuthenticated(signed) {
  account.value = saveAccount(signed)
  error.value = ''
  view.value = 'lobby'
  refreshRooms()
  refreshActiveRoom()
}

function logout() {
  clearAccount()
  clearSession()
  account.value = null
  session.value = null
  activeRoom.value = null
  view.value = 'lobby'
}

async function createRoom(payload) {
  busy.value = true
  error.value = ''
  try {
    const result = await api.createRoom({
      ...payload,
      hostNickname: account.value.nickname,
      accountId: account.value.accountId,
      accountToken: account.value.accountToken
    })
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
    if (snapshot.phase === 'LOBBY' && account.value) {
      const result = await api.joinRoom(roomId, {
        nickname: account.value.nickname,
        accountId: account.value.accountId,
        accountToken: account.value.accountToken
      })
      session.value = saveSession({
        roomId,
        playerId: result.playerId,
        reconnectToken: result.reconnectToken,
        roomName: result.room.name
      })
    } else {
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
  refreshActiveRoom()
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
  if (!account.value) return
  await refreshActiveRoom()
  if (session.value?.playerId && activeRoom.value) {
    view.value = 'room'
    notice.value = '已回到上次的房间'
  } else if (session.value) {
    clearSession()
    session.value = null
  }
})
</script>

<template>
  <div class="app">
    <header class="row topbar">
      <div class="brand">✈️ 在线飞行棋</div>
      <span class="spacer"></span>
      <template v-if="account">
        <span class="small muted">{{ account.nickname }}</span>
        <button class="ghost" @click="view = 'profile'">我的战绩</button>
        <button class="ghost" @click="logout">退出</button>
      </template>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>

    <AuthPanel v-if="!account" @done="onAuthenticated" />

    <ProfilePanel
      v-else-if="view === 'profile'"
      :account="account"
      @back="view = 'lobby'"
      @account-changed="(next) => (account = saveAccount(next))"
    />

    <RoomView
      v-else-if="view === 'room' && session"
      :key="session.roomId"
      :room-id="session.roomId"
      :session="session"
      :account="account"
      @left="onLeft"
      @failed="onRoomFailed"
    />

    <Lobby
      v-else
      :rooms="rooms"
      :active-room="activeRoom"
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
