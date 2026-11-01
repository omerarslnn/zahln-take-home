import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const REQUIRED_ENV = ['VITE_API_BASE_URL', 'VITE_CANDIDATE_ID', 'VITE_SEEDED_PASSWORD'] as const;

// Fixed ports keep the dashboard clear of the Metro servers (8081 student, 8082 till) and keep the
// browser origin the API sees predictable: http://localhost:5173 (dev) and http://localhost:4173 (preview).
export default defineConfig(({ command, mode }) => {
  // A production build without its public configuration would deploy a dashboard that cannot sign
  // in; stop the build instead. The dev server starts anyway and names the missing values on screen.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `Missing ${missing.join(', ')}. Run \`pnpm env:init\` and fill apps/dashboard/.env, ` +
          "or set them in the host's build environment (see apps/dashboard/.env.example).",
      );
    }
  }
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  };
});
