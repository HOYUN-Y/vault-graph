// 비공개 규칙(Node 서버 전용). 라우터의 비공개 목록과 장부를 합쳐 판정한다.
// tests/privacy.test.ts의 고정 사례로 경로 판정과 장부 오류 처리를 검증한다.
// 규칙을 해석할 수 없으면 예외를 던진다 — 호출 쪽은 실제 데이터를 내보내지 않는다(fail closed).
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const LEDGER = '.secondbrain/private-paths.txt';
// 비밀정보로 보이는 이름(파일 · 폴더 이름 기준). .key는 Keynote 문서라 넣지 않는다.
export const SECRET_RE = /(^\.env|^env[._-]|(^|[._-])env(\.txt)?$|\.env$|keys?\.txt$|\.pem$|\.p12$|\.pfx$|\.keystore$|^id_(rsa|ed25519|ecdsa)|token|secret|credential|password|api[ _-]?keys?\b|\.ppk$|비밀번호|\.netrc$)/i;

const nfc = (value: string) => value.normalize('NFC');
const stripEnd = (value: string) => value.replace(/\/+$/, '');

export class PrivacyRuleError extends Error {}

/** 라우터의 "비공개" 줄 백틱 이름 + 지정 장부의 합집합. 해석할 수 없으면 PrivacyRuleError */
export function loadPrivatePaths(root: string, router: string): Set<string> {
  const priv = new Set<string>();
  for (const line of router.split(/\r\n|\r|\n/)) {
    if (!nfc(line).includes('비공개')) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) priv.add(stripEnd(nfc(m[1])));
  }
  const markers = [...router.matchAll(/^[ \t]*-?[ \t]*비공개 장부:[ \t]*(.*?)[ \t]*$/gm)].map(m => m[1]);
  const ledger = path.join(root, LEDGER);
  let exists = false;
  try { lstatSync(ledger); exists = true; } catch { exists = false; }
  if (!markers.length) {
    if (exists || router.includes('비공개 장부')) throw new PrivacyRuleError('비공개 장부 표식이 없거나 해석할 수 없습니다');
    return priv;
  }
  if (markers.length !== 1 || markers[0] !== LEDGER) throw new PrivacyRuleError('비공개 장부는 .secondbrain/private-paths.txt를 한 번만 지정해야 합니다');
  let text: string;
  try {
    const realRoot = realpathSync(root), realLedger = realpathSync(ledger);
    if (realLedger !== realRoot && !realLedger.startsWith(realRoot + path.sep)) throw new PrivacyRuleError('비공개 장부는 볼트 내부 파일이어야 합니다');
    text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(realLedger));
  } catch (error) {
    if (error instanceof PrivacyRuleError) throw error;
    throw new PrivacyRuleError('비공개 장부를 읽을 수 없습니다');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const raw of text.split(/\r\n|\r|\n/)) {
    let p = nfc(raw.trim());
    if (!p || p.startsWith('#')) continue;
    p = stripEnd(p);
    if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.includes('\\') || /[*?`\x00]/.test(p)
      || p.split('/').some(part => part === '' || part === '.' || part === '..')) {
      throw new PrivacyRuleError('비공개 장부에 볼트 상대경로가 아닌 항목이 있습니다');
    }
    priv.add(p);
  }
  return priv;
}

/** 볼트 기준 상대경로(NFC, '/')가 비공개 목록에 걸리는지 */
export function isPrivate(rel: string, priv: ReadonlySet<string>): boolean {
  const r = nfc(rel);
  for (const n of priv) if (r === n || r.startsWith(n + '/')) return true;
  return false;
}

/** 경로의 어느 조각이든 비밀정보로 보이는 이름인지 */
export const isSecretPath = (rel: string) => rel.split('/').some(seg => SECRET_RE.test(seg));

// 로컬 절대경로처럼 보이는 문자열: file: URL, 임의 POSIX 절대경로(두 조각 이상), 홈(~/), Windows 드라이브 · UNC 경로
const STOP = `\\s\`'"<>)\\]|`;
const ABS_PATH = new RegExp([
  `file:[^${STOP}]+`,
  `(?<![\\p{L}\\p{N}_.\\-:/~\\\\])\\/(?:[^${STOP}/]+\\/)+[^${STOP}]*`,
  `(?<![\\p{L}\\p{N}_])~\\/[^${STOP}]*`,
  `(?<![\\p{L}\\p{N}_])[A-Za-z]:[\\\\/][^${STOP}]*`,
  `\\\\\\\\[^${STOP}\\\\]+\\\\[^${STOP}]*`
].join('|'), 'gu');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 브라우저로 보내기 전 글자 지우기: 비공개 전체 경로와 그 마지막 이름을 [비공개]로, 로컬 절대경로를 [로컬 경로]로 바꾼다.
 * NFC · NFD 표기를 모두 지운다. 세 글자 미만의 짧은 이름은 다른 낱말 일부를 지우지 않게 앞뒤가 글자 · 숫자가 아닐 때만 지운다.
 */
export function makeRedactor(priv: ReadonlySet<string>) {
  const words = new Set<string>();
  for (const p of priv) {
    words.add(p);
    const base = p.split('/').pop() ?? '';
    if (base) words.add(base);
  }
  const forms = [...new Set([...words].flatMap(w => [w, w.normalize('NFD')]))].sort((a, b) => b.length - a.length);
  const pattern = forms.map(w => (w.normalize('NFC').length < 3 ? `(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])` : escapeRe(w)));
  const re = pattern.length ? new RegExp(pattern.join('|'), 'gu') : null;
  return (text: string) => {
    let out = text.replace(ABS_PATH, '[로컬 경로]');
    if (re) out = out.replace(re, '[비공개]');
    return out;
  };
}
