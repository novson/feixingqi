import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  // 部署在子路径下：npm run build -- --mode subpath（默认根路径）
  base: mode === 'subpath' ? '/feixingqi/' : '/',
  plugins: [vue()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true }
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js']
  }
}))
