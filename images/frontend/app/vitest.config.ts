import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { readFileSync, readdirSync } from 'node:fs'
import type { Plugin } from 'vite'

// Decodificadores de geometría/texturas comprimidas (Draco, KTX2/Basis) que usa GLTFLoader.
// Se sirven desde node_modules/three (en desarrollo) y se copian a dist/libs (en build), así siempre
// coinciden con la versión instalada de three.
const threeDecoderDirs: Record<string, string> = {
  'libs/draco/': './node_modules/three/examples/jsm/libs/draco/gltf/',
  'libs/basis/': './node_modules/three/examples/jsm/libs/basis/',
}
function threeDecoders(): Plugin {
  const files = Object.entries(threeDecoderDirs).flatMap(([publicDir, srcDir]) => {
    const dir = fileURLToPath(new URL(srcDir, import.meta.url))
    return readdirSync(dir)
      .filter((name) => name.endsWith('.js') || name.endsWith('.wasm'))
      .map((name) => ({ publicPath: publicDir + name, absPath: dir + name }))
  })
  return {
    name: 'three-decoders',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0].replace(/^\//, '')
        const file = files.find((f) => f.publicPath === url)
        if (!file) return next()
        res.setHeader('Content-Type', file.publicPath.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(file.absPath))
      })
    },
    generateBundle() {
      for (const f of files) this.emitFile({ type: 'asset', fileName: f.publicPath, source: readFileSync(f.absPath) })
    },
  }
}

export default defineConfig({
  plugins: [react(), threeDecoders()],
  define: {
    'process.env': '{}',
    'process.browser': true,
    global: 'globalThis',
  },
})