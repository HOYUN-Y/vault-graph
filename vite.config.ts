import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vaultPlugin } from './server/vault-plugin';

// 로컬 전용: 루프백 주소에만 열고, 포트가 사용 중이면 다른 포트로 넘어가지 않고 실패한다(strictPort).
// vaultPlugin: settings.json의 vaultPath로 실제 볼트를 읽기 전용으로 연결한다(설정이 없으면 합성 데모).
// settings.json에는 실제 절대경로가 있으므로 정적 파일로도 내보내지 않는다(fs.deny + 플러그인 차단).
const deny = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', 'settings.json', '**/settings.json'];
export default defineConfig({
  plugins: [react(), vaultPlugin()],
  server: { host: '127.0.0.1', port: 5180, strictPort: true, fs: { strict: true, deny } },
  preview: { host: '127.0.0.1', port: 5181, strictPort: true }
});
