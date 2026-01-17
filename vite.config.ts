import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get directory name in ES modules
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Base public path for GitHub Pages
  // This ensures all assets are loaded from /board_games/ prefix
  base: '/board_games/',
  
  // Build configuration
  build: {
    // Output directory for production build
    outDir: 'dist',
    
    // Generate source maps for debugging
    sourcemap: true,
    
    // Minify the output
    minify: 'terser',
    
    // Target modern browsers (ES2020 compatible)
    target: 'es2020',
    
    // Rollup-specific options
    rollupOptions: {
      // Explicitly define entry point
      input: {
        main: resolve(__dirname, 'index.html')
      },
      
      // Output configuration
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // Separate PeerJS into its own chunk
          'peerjs': ['peerjs'],
          
          // Game engine in separate chunk
          'engine': [
            './src/engine/validation',
            './src/engine/actionResolver',
            './src/engine/turnSystem',
            './src/engine/endgame'
          ],
          
          // P2P networking in separate chunk
          'p2p': [
            './src/p2p/browserRoom',
            './src/p2p/browserClient',
            './src/p2p/uiSync',
            './src/p2p/protocol',
            './src/p2p/stateSync'
          ]
        },
        
        // Asset file naming
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    },
    
    // Chunk size warning limit (500 KB)
    chunkSizeWarningLimit: 500,
    
    // Clear output directory before building
    emptyOutDir: true
  },
  
  // Development server configuration
  server: {
    port: 5173,
    open: true,
    cors: true
  },
  
  // Preview server configuration (for testing production build)
  preview: {
    port: 4173,
    open: true
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      // Optional: Create path aliases for cleaner imports
      '@': resolve(__dirname, './src'),
      '@engine': resolve(__dirname, './src/engine'),
      '@p2p': resolve(__dirname, './src/p2p'),
      '@types': resolve(__dirname, './src/types'),
      '@ui': resolve(__dirname, './src/ui')
    }
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['peerjs']
  }
});
