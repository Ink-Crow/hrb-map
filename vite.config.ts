import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import Unocss from 'unocss/vite'
import { presetUno, presetAttributify } from 'unocss'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    Unocss({
      presets: [
        presetUno(),         // 基础原子类
        presetAttributify()  // 支持 <div w="200px" bg="red">
      ],
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
