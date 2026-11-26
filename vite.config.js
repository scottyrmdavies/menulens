import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Local dev only. On Vercel, /api is served by the functions in /api.
// https://vite.dev/config/
const scanPort = process.env.PORT || 8787

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${scanPort}`,
    },
  },
})
