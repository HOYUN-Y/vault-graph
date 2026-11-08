// Vite 플러그인: 실제 볼트 읽기 전용 API와 읽기 경계(개발 · 미리보기 서버 공통). 새 의존성 없이 Node http 미들웨어만 쓴다.
//   GET  /api/vault/status       연결 상태 · 버전(경로 없음)
//   GET  /api/vault/graph        지운 안내 문서 · 연결 자료(볼트 상대경로)
//   GET  /api/vault/doc/<id>     불투명 ID로 원문 미리보기(지원 형식만)
//   POST /api/vault/refresh      수동 새로고침
// 경계: 루프백 접속 · Host 확인(DNS 재바인딩 방지) · 같은 출처(Origin · Sec-Fetch-Site) · POST는 Origin 필수.
// settings.json(실제 절대경로)과 프로젝트 밖 /@fs 접근은 막는다.
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import path from 'node:path';
import { parse as legacyParse } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { VaultService } from './vault-service';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ID = /^d[0-9a-z]{2,32}$/;

/** 요청 경계 확인(순수 함수, 시험 대상). 통과하면 null, 막으면 HTTP 상태 */
export function guard(req: { method?: string; headers: Record<string, string | string[] | undefined>; remoteAddress?: string; port: number }): number | null {
  if (!req.remoteAddress || !LOOPBACK.has(req.remoteAddress)) return 403;
  const host = String(req.headers.host ?? '');
  const hosts = [`127.0.0.1:${req.port}`, `localhost:${req.port}`, `[::1]:${req.port}`];
  if (!hosts.includes(host)) return 403;
  const origin = req.headers.origin ? String(req.headers.origin) : null;
  if (origin && !hosts.map(h => `http://${h}`).includes(origin)) return 403;
  const site = req.headers['sec-fetch-site'] ? String(req.headers['sec-fetch-site']) : null;
  if (site && site !== 'same-origin' && site !== 'none') return 403;
  if (req.method === 'POST' && !origin) return 403;
  return null;
}

const BAD = Symbol('sbv-bad-request');

/** 요청 대상이 Node URL 해석을 깨뜨리는지(예: 절대 형식 'http://['). 이런 요청은 Vite 연결 계층에서 예외로 서버 전체를 멈추게 한다 */
export function badTarget(url: string | undefined): boolean {
  if (typeof url !== 'string' || !url) return true;
  try { legacyParse(url); new URL(url, 'http://local'); return false; } catch { return true; }
}

/** 절대 형식 요청 대상(http://호스트/…)의 호스트 · 포트가 이 서버(루프백 · 같은 포트)가 아니면 true */
export function foreignAuthority(url: string, port: number): boolean {
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) return false;
  try {
    const u = new URL(url);
    return !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || Number(u.port || (u.protocol === 'https:' ? 443 : 80)) !== port;
  } catch { return true; }
}

/** 미들웨어보다 먼저 받는 요청 수신기: 해석할 수 없는 요청 대상을 안전한 경로로 바꿔 두고, 첫 미들웨어가 400으로 끝낸다 */
function harden(http: Server | null | undefined) {
  http?.prependListener('request', (req: IncomingMessage) => {
    if (badTarget(req.url) || foreignAuthority(req.url!, req.socket.localPort ?? 0)) { (req as IncomingMessage & { [BAD]?: boolean })[BAD] = true; req.url = '/'; }
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.end(JSON.stringify(body));
}

function middleware(service: VaultService, projectRoot: string): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    if ((req as IncomingMessage & { [BAD]?: boolean })[BAD] || badTarget(req.url)) { send(res, 400, { error: 'bad-request' }); return; }
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname); } catch { send(res, 400, { error: 'bad-request' }); return; }
    // 실제 절대경로가 든 로컬 설정 파일은 어떤 경로 · 쿼리 · 대소문자로도 내보내지 않는다(대소문자를 가리지 않는 파일 시스템)
    if (path.posix.basename(pathname).normalize('NFC').toLowerCase() === 'settings.json') { send(res, 404, { error: 'not-found' }); return; }
    // /@fs는 프로젝트 안 파일만(볼트 · 외부 원문 직접 읽기 차단)
    if (pathname.startsWith('/@fs/')) {
      const target = path.resolve(pathname.slice('/@fs'.length));
      if (target !== projectRoot && !target.startsWith(projectRoot + path.sep)) { send(res, 403, { error: 'forbidden' }); return; }
    }
    if (!pathname.startsWith('/api/vault/')) { next(); return; }
    const status = guard({ method: req.method, headers: req.headers, remoteAddress: req.socket.remoteAddress, port: req.socket.localPort ?? 0 });
    if (status) { send(res, status, { error: 'forbidden' }); return; }
    const route = pathname.slice('/api/vault/'.length);
    void (async () => {
      try {
        if (req.method === 'GET' && route === 'status') send(res, 200, service.status());
        else if (req.method === 'GET' && route === 'graph') send(res, 200, service.graph());
        else if (req.method === 'GET' && route.startsWith('doc/')) {
          const id = route.slice(4);
          send(res, 200, ID.test(id) ? await service.preview(id) : { state: 'gone' });
        } else if (req.method === 'POST' && route === 'refresh') { await service.refresh(); send(res, 200, service.status()); }
        else send(res, req.method === 'GET' || req.method === 'POST' ? 404 : 405, { error: 'not-found' });
      } catch { send(res, 500, { error: 'internal' }); }
    })();
  };
}

export function vaultPlugin(): Plugin {
  let service: VaultService | null = null;
  const attach = async (root: string, use: (fn: Connect.NextHandleFunction) => void, onClose: (fn: () => void) => void) => {
    // 시험용: SBV_SETTINGS로 다른 설정 파일(fixture 볼트)을 가리킬 수 있다. 기본은 프로젝트의 settings.json
    const settingsFile = process.env.SBV_SETTINGS && path.isAbsolute(process.env.SBV_SETTINGS) ? process.env.SBV_SETTINGS : path.join(root, 'settings.json');
    service = new VaultService(settingsFile);
    await service.start();
    use(middleware(service, root));
    onClose(() => service?.close());
  };
  return {
    name: 'second-brain-vault',
    async configureServer(server) {
      harden(server.httpServer as Server | null);
      await attach(server.config.root, fn => server.middlewares.use(fn), fn => server.httpServer?.once('close', fn));
    },
    async configurePreviewServer(server) {
      harden(server.httpServer as Server | null);
      await attach(server.config.root, fn => server.middlewares.use(fn), fn => server.httpServer?.once('close', fn));
    }
  };
}
