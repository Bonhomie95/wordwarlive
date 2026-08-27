import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The admin app talks to the WordWar API. In dev we proxy /api to the local
// server so there are no CORS concerns and the app can be served from :5173.
// Point VITE_API_TARGET at the API origin (defaults to the server's dev port).
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const target = env.VITE_API_TARGET || 'http://localhost:4000';
    return {
        plugins: [react()],
        server: {
            port: 5173,
            proxy: {
                '/api': { target, changeOrigin: true },
            },
        },
    };
});
