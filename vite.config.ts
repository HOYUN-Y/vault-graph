import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vaultPlugin } from './server/vault-plugin';

// Local only: listens on the loopback address only, and fails instead of moving to another port when the port is taken (strictPort).
// vaultPlugin: connects the real vault read-only via vaultPath in settings.json (synthetic demo when unset).
// settings.json holds a real absolute path, so it is never served as a static file either (fs.deny + plugin block).
const deny = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', 'settings.json', '**/settings.json'];
export default defineConfig({
  plugins: [react(), vaultPlugin()],
  server: { host: '127.0.0.1', port: 5180, strictPort: true, fs: { strict: true, deny } },
  preview: { host: '127.0.0.1', port: 5181, strictPort: true }
});
