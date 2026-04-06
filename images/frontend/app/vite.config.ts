import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': '{}',
    'process.browser': true,
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['react-dat-gui'],
  },
})