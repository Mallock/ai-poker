import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
