<script setup>
import { ref } from 'vue'
import { api } from '../services/api.js'
import { normalizeLoginCodeInput } from '../services/account.js'

const emit = defineEmits(['done'])

const mode = ref('create')
const nickname = ref('')
const loginCode = ref('')
const error = ref('')
const busy = ref(false)
const created = ref(null)
const copied = ref(false)

async function submit() {
  error.value = ''
  copied.value = false
  if (!nickname.value.trim()) {
    error.value = '请先填写昵称'
    return
  }
  busy.value = true
  try {
    if (mode.value === 'create') {
      created.value = await api.createAccount(nickname.value.trim())
      return
    }
    const { code, valid } = normalizeLoginCodeInput(loginCode.value)
    if (!valid) {
      error.value = '跨设备登录码是 4 位数字或 12 位字母数字组合'
      return
    }
    emit('done', await api.login(nickname.value.trim(), code))
  } catch (failure) {
    error.value = failure.message
  } finally {
    busy.value = false
  }
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(created.value.loginCode)
    copied.value = true
  } catch {
    copied.value = false
  }
}

function enter() {
  emit('done', created.value)
}
</script>

<template>
  <div class="auth">
    <div class="card auth-card">
      <h1>在线飞行棋</h1>
      <p class="muted small">2–8 人同局，房间约局，掉线自动托管。不用注册密码，记住登录码即可换设备继续。</p>

      <div v-if="!created" class="tabs">
        <button :class="['ghost', mode === 'create' && 'active']" @click="mode = 'create'">创建账号</button>
        <button :class="['ghost', mode === 'login' && 'active']" @click="mode = 'login'">用登录码登录</button>
      </div>

      <div v-if="created" class="created">
        <div class="notice">账号创建成功，请保存下面的跨设备登录码。</div>
        <div class="code" @click="copyCode">{{ created.loginCode }}</div>
        <p class="muted small">{{ copied ? '已复制到剪贴板' : '点击复制。换设备时用「昵称 + 登录码」登录。' }}</p>
        <button @click="enter">进入大厅</button>
      </div>

      <form v-else @submit.prevent="submit">
        <div class="field">
          <label for="nickname">昵称（1–16 个字）</label>
          <input id="nickname" v-model="nickname" maxlength="16" placeholder="例如：小明" autocomplete="off" />
        </div>
        <div v-if="mode === 'login'" class="field">
          <label for="code">跨设备登录码</label>
          <input id="code" v-model="loginCode" placeholder="ABCD-EFGH-IJKL 或 2580" autocomplete="off" />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="busy">{{ busy ? '处理中…' : mode === 'create' ? '创建账号' : '登录' }}</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth {
  display: flex;
  justify-content: center;
  padding-top: 40px;
}

.auth-card {
  width: min(440px, 100%);
}

h1 {
  font-size: 26px;
  margin-bottom: 8px;
}

.tabs {
  display: flex;
  gap: 8px;
  margin: 18px 0;
}

.tabs button.active {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}

.field {
  margin-bottom: 14px;
}

form button {
  width: 100%;
}

.created {
  margin-top: 18px;
  display: grid;
  gap: 12px;
}

.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 24px;
  letter-spacing: 2px;
  text-align: center;
  padding: 14px;
  border: 1px dashed var(--brand);
  border-radius: 12px;
  background: var(--brand-soft);
  color: var(--brand);
  cursor: pointer;
}
</style>
