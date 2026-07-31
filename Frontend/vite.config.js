import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Panel is served locally by Node-RED / a lightweight static server on the rig.
// Kept simple on purpose — no SSR, no router complexity for a single-screen kiosk.
//
// Production URL (served by Node-RED httpStatic → settings.js):
//   http://<rig-hostname>:1880/ui/   ← Chromium kiosk target
//   ws://<rig-hostname>:1880/ws/dashboard  ← WebSocket (no proxy needed; same origin)
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true, // reachable on LAN while developing against the real Node-RED instance
    port: 5173,
    proxy: {
      // dev-time proxy so the Vite dev server can reach Node-RED's WS + HTTP endpoints.
      // changeOrigin rewrites the request host so Node-RED doesn't reject it.
      // Set VITE_WS_URL=ws://localhost:5173/ws/dashboard in .env.local to use this.
      '/ws': {
        target: 'ws://localhost:1880',
        ws: true,
        changeOrigin: true,
        // Suppress "ECONNREFUSED" noise in the terminal when Node-RED isn't running yet.
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code !== 'ECONNREFUSED') console.error('[ws-proxy]', err.message)
          })
        }
      },
      '/api': { target: 'http://localhost:1880', changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
