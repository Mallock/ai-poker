import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import edgeTtsPlugin from './vite-plugin-edge-tts.js'

export default defineConfig({
  plugins: [vue(), edgeTtsPlugin()],
  server: {
    proxy: {
      // Proxy LM Studio so the browser doesn't trip CORS.
      '/lm': {
        target: 'http://localhost:1234',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lm/, ''),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
})
