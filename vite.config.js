import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // ← match your GitHub repo name exactly
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
