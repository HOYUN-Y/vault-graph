// Vite plugin: read-only real vault API and its access boundary (dev and preview servers). Plain Node http middleware, no new dependencies.
//   GET  /api/vault/status       connection state and version (no paths)
//   GET  /api/vault/graph        redacted guide documents and materials (vault-relative paths)
//   GET  /api/vault/doc/<id>     source file preview by opaque ID (supported formats only)
//   POST /api/vault/refresh      manual refresh
// Boundary: loopback only, Host check (DNS rebinding), same origin (Origin, Sec-Fetch-Site), Origin required for POST.
// settings.json (holds a real absolute path) and /@fs access outside the project are blocked.
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import path from 'node:path';
import { parse as legacyParse } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { VaultService } from './vault-service';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ID = /^d[0-9a-z]{2,32}$/;

/** Request boundary check (pure, tested). null if allowed, otherwise the HTTP status */
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

/** Whether the request target breaks Node URL parsing (e.g. absolute form 'http://['). Such requests throw in Vite's connect layer and stop the whole server */
export function badTarget(url: string | undefined): boolean {
  if (typeof url !== 'string' || !url) return true;
  try { legacyParse(url); new URL(url, 'http://local'); return false; } catch { return true; }
}

/** true if an absolute-form target (http://host/...) names a host or port other than this server (loopback, same port) */
export function foreignAuthority(url: string, port: number): boolean {
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) return false;
  try {
    const u = new URL(url);
    return !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || Number(u.port || (u.protocol === 'https:' ? 443 : 80)) !== port;
  } catch { return true; }
}

/** Request listener that runs before middleware: swaps unparseable targets for a safe path; the first middleware then answers 400 */
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
    // Never serve the local settings file (holds a real absolute path) under any path, query or casing (case-insensitive file systems)
    if (path.posix.basename(pathname).normalize('NFC').toLowerCase() === 'settings.json') { send(res, 404, { error: 'not-found' }); return; }
    // /@fs serves project files only (blocks direct reads of the vault or outside source files)
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
    // For tests: SBV_SETTINGS can point at another settings file (fixture vault). Defaults to the project's settings.json
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
