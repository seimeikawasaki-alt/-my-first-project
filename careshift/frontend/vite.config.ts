import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 一時デモ用トンネル（cloudflared / ngrok / localtunnel）のホスト名を許可。
    // これがないと Vite が「host is not allowed」で外部アクセスを弾く。
    allowedHosts: [
      '.trycloudflare.com',
      '.ngrok-free.app',
      '.ngrok-free.dev',
      '.ngrok.io',
      '.loca.lt',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
