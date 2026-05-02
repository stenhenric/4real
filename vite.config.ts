import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('@tonconnect')) {
              return 'tonconnect';
            }

            if (id.includes('socket.io-client')) {
              return 'socket';
            }

            if (id.includes('roughjs') || id.includes('canvas-confetti')) {
              return 'canvas';
            }

            if (
              id.includes('react-router-dom') ||
              id.includes('react-dom') ||
              id.includes(`${path.sep}react${path.sep}`)
            ) {
              return 'react-vendor';
            }

            return undefined;
          },
        },
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
