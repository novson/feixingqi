<script setup>
import { ref } from 'vue'

const emit = defineEmits(['done'])
const nickname = ref('')
const error = ref('')

function submit() {
  const value = nickname.value.trim()
  if (value.length < 1) {
    error.value = '先起个昵称吧'
    return
  }
  if (value.length > 16) {
    error.value = '昵称最多 16 个字'
    return
  }
  error.value = ''
  emit('done', value)
}
</script>

<template>
  <div class="gate">
    <div class="card gate-card">
      <h1>✈️ 在线飞行棋</h1>
      <p class="muted small">2–8 人同局，房间约局，掉线自动托管。不用注册，填个昵称就能开玩。</p>
      <form @submit.prevent="submit">
        <label for="nickname">你的昵称</label>
        <input id="nickname" v-model="nickname" maxlength="16" placeholder="例如：小明" autocomplete="off" />
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit">进入大厅</button>
      </form>
      <p class="muted small tip">昵称会存在这台设备的浏览器里，下次打开自动带上。</p>
    </div>
  </div>
</template>

<style scoped>
.gate {
  display: flex;
  justify-content: center;
  padding-top: 48px;
}

.gate-card {
  width: min(420px, 100%);
}

h1 {
  font-size: 26px;
  margin-bottom: 8px;
}

form {
  margin-top: 18px;
}

form button {
  width: 100%;
  margin-top: 14px;
}

.tip {
  margin-top: 14px;
}
</style>
