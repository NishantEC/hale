import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '0.0.0.0' },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) return 'recharts'
          if (id.includes('node_modules/d3-')) return 'recharts'
          if (id.includes('node_modules/victory-vendor')) return 'recharts'
          return undefined
        },
      },
    },
  },
})
