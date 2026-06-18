import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', 
  optimizeDeps: {
    exclude:[
      'hyperswarm', 
      'b4a', 
      'sodium-native', 
      'corestore', 
      'hypercore', 
      'autobase',
      'hyperbee',
      'pear-runtime',
      'os',
      'http',
      'child_process'
    ]
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external:[
        'hyperswarm', 
        'b4a', 
        'sodium-native', 
        'corestore', 
        'hypercore', 
        'autobase',
        'hyperbee',
        'pear-runtime',
        'events',
        'fs',
        'path',
        'crypto',
        'stream',
        'os',
        'http',
        'child_process'
      ]
    }
  }
})