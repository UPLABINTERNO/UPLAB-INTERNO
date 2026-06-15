import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Porta fixa para o Tauri consumir o dev server.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [sveltekit()],
  // Evita que o Vite mascare erros do Rust.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421
        }
      : undefined,
    watch: {
      // Não vigiar o backend Rust.
      ignored: ['**/src-tauri/**']
    }
  }
});
