<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../services/api.js'
import { normalizeLoginCodeInput } from '../services/account.js'

const props = defineProps({ account: { type: Object, required: true } })
const emit = defineEmits(['back', 'account-changed'])

const profile = ref(null)
const error = ref('')
const busy = ref(false)
const newCode = ref('')
const message = ref('')

async function load() {
  error.value = ''
  try {
    profile.value = await api.profile(props.account.accountId, props.account.accountToken)
  } catch (failure) {
    error.value = failure.message
  }
}

async function rotate() {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const raw = newCode.value.trim()
    if (raw) {
      const { code, valid } = normalizeLoginCodeInput(raw)
      if (!valid) {
        error.value = '新的登录码需要 4 位数字或 12 位字母数字组合'
        return
      }
      newCode.value = code
    }
    const result = await api.rotateLoginCode(props.account.accountId, props.account.accountToken, raw || null)
    emit('account-changed', { ...props.account, loginCode: result.loginCode })
    newCode.value = ''
    message.value = `新的跨设备登录码：${result.loginCode}，请保存好。`
  } catch (failure) {
    error.value = failure.message
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="card">
    <div class="row">
      <h2>{{ profile ? profile.nickname : '个人战绩' }}</h2>
      <span class="spacer"></span>
      <button class="ghost" @click="emit('back')">返回大厅</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="message" class="notice">{{ message }}</p>

    <div v-if="profile" class="stats">
      <div class="stat">
        <div class="num">{{ profile.games }}</div>
        <div class="muted small">总场次</div>
      </div>
      <div class="stat">
        <div class="num">{{ profile.wins }}</div>
        <div class="muted small">夺冠</div>
      </div>
      <div class="stat">
        <div class="num">{{ Math.round(profile.winRate * 100) }}%</div>
        <div class="muted small">胜率</div>
      </div>
    </div>

    <div class="code-row">
      <div>
        <label>当前跨设备登录码</label>
        <div class="code">{{ props.account.loginCode || '（未保存，请重新换一个）' }}</div>
      </div>
      <div>
        <label for="new-code">换成自定义登录码（可留空随机生成）</label>
        <div class="row">
          <input id="new-code" v-model="newCode" placeholder="例如 2580" maxlength="14" />
          <button class="subtle" :disabled="busy" @click="rotate">{{ busy ? '处理中…' : '换一个' }}</button>
        </div>
      </div>
    </div>

    <h3>最近战绩</h3>
    <ul class="history">
      <li v-for="entry in profile?.history || []" :key="entry.id">
        <div class="row">
          <strong :class="{ win: entry.rank === 1 }">第 {{ entry.rank }} 名</strong>
          <span class="muted small">{{ entry.roomName }}</span>
          <span class="tag">{{ entry.mode === 'AI' ? '含 AI' : '纯真人' }}</span>
          <span class="spacer"></span>
          <span class="muted small">{{ new Date(entry.at).toLocaleString('zh-CN', { hour12: false }) }}</span>
        </div>
      </li>
      <li v-if="profile && profile.history.length === 0" class="muted small">还没有打过完整的一局。</li>
    </ul>
  </div>
</template>

<style scoped>
.stats {
  display: flex;
  gap: 28px;
  margin: 16px 0;
}

.num {
  font-size: 26px;
  font-weight: 700;
}

.code-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 16px 0 20px;
  align-items: end;
}

.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 18px;
  letter-spacing: 1px;
  color: var(--brand);
}

.code-row .row {
  gap: 8px;
}

.code-row button {
  white-space: nowrap;
}

.history {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.history li {
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.win {
  color: var(--ok);
}

@media (max-width: 720px) {
  .code-row {
    grid-template-columns: 1fr;
  }
}
</style>
