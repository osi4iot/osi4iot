import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: 'react-dat-gui/dist/index.css',
        replacement: fileURLToPath(
          new URL('./node_modules/react-dat-gui/dist/index.css', import.meta.url)
        ),
      },
    ],
  },
  define: {
    'process.env': '{}',
    'process.browser': true,
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['react-dat-gui'],
  },
})