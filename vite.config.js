import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('chess.js') || id.includes('cm-chessboard')) {
              return 'chess-vendor';
            }
            if (id.includes('@jitsi')) {
              return 'jitsi-vendor';
            }
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
          }
          return undefined;
        },
      },
    },
  },
})