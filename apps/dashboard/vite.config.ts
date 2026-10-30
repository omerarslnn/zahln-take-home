import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Fixed ports keep the dashboard clear of the Metro servers (8081 student, 8082 till) and keep the
// browser origin the API sees predictable: http://localhost:5173 (dev) and http://localhost:4173 (preview).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
