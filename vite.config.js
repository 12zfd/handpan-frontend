import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = process.env.VITE_DEV_BACKEND || 'http://127.0.0.1:8000'
const paths = ['/login', '/upload', '/convert', '/history', '/scores', '/download', '/healthz']

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(paths.map(p => [p, { target: BACKEND, changeOrigin: true }])),
  },
  build: { outDir: 'dist', sourcemap: false },
})
