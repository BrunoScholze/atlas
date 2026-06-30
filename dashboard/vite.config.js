import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  server: {
    proxy: {
      '/dashboard/overview':     'http://localhost:3000',
      '/dashboard/execucoes':    'http://localhost:3000',
      '/dashboard/efetividade':  'http://localhost:3000',
    }
  }
})
