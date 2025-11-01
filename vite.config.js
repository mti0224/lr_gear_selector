// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 一定要對應你的 repo 名稱
  base: '/lr_gear_selector/',
  plugins: [react()],
})
