import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // Dependencias ESM que importan styled-components por defecto: se procesan con Vite
      server: { deps: { inline: ['react-loader-spinner'] } },
    },
  }),
)
