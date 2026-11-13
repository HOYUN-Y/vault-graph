// Private rules (Node server only). Combines the router's private list with the private ledger.
// tests/privacy.test.ts pins path matching and ledger error handling.
// Throws when rules cannot be parsed; callers then send no real data (fail closed).
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const LEDGER = '.secondbrain/private-paths.txt';
export const POLICY_DIR = '.secondbrain';
export const isPolicyPath = (rel: string) => rel === POLICY_DIR || rel.startsWith(POLICY_DIR + '/');
// Names that look like secrets (file or folder name). .key is excluded because it is a Keynote document.
export const SECRET_RE = /(^\.env|^env[._-]|(^|[._-])env(\.txt)?$|\.env$|keys?\.txt$|\.pem$|\.p12$|\.pfx$|\.keystore$|^id_(rsa|ed25519|ecdsa)|token|secret|credential|password|api[ _-]?keys?\b|\.ppk$|비밀번호|\.netrc$)/i;

const nfc = (value: string) => value.normalize('NFC');
const stripEnd = (value: string) => value.replace(/\/+$/, '');

export class PrivacyRuleError extends Error {}

/** Router line that marks private names: Korean `비공개` or English `private` */
export const isPrivateLine = (line: string) => nfc(line).includes('비공개') || /\bprivate\b/i.test(line);

/** Union of backticked names on the router's private lines and the private ledger. Throws PrivacyRuleError if unparseable */
export function loadPrivatePaths(root: string, router: string): Set<string> {
  const priv = new Set<string>();
  for (const line of router.split(/\r\n|\r|\n/)) {
    if (!isPrivateLine(line)) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) priv.add(stripEnd(nfc(m[1])));
  }
  const markers = [...router.matchAll(/^[ \t]*-?[ \t]*(?:비공개 장부|private ledger):[ \t]*(.*?)[ \t]*$/gim)].map(m => m[1]);
  const ledger = path.join(root, LEDGER);
  let exists = false;
  try { lstatSync(ledger); exists = true; } catch { exists = false; }
  if (!markers.length) {
    if (exists || /비공개 장부|private ledger/i.test(router)) throw new PrivacyRuleError('Private ledger marker is missing or cannot be parsed');
    return priv;
  }
  if (markers.length !== 1 || markers[0] !== LEDGER) throw new PrivacyRuleError('The private ledger must point to .secondbrain/private-paths.txt exactly once');
  let text: string;
  try {
    const realRoot = realpathSync(root), realLedger = realpathSync(ledger);
    if (realLedger !== realRoot && !realLedger.startsWith(realRoot + path.sep)) throw new PrivacyRuleError('The private ledger must be a file inside the vault');
    text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(realLedger));
  } catch (error) {
    if (error instanceof PrivacyRuleError) throw error;
    throw new PrivacyRuleError('Cannot read the private ledger');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const raw of text.split(/\r\n|\r|\n/)) {
    let p = nfc(raw.trim());
    if (!p || p.startsWith('#')) continue;
    p = stripEnd(p);
    if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.includes('\\') || /[*?`\x00]/.test(p)
      || p.split('/').some(part => part === '' || part === '.' || part === '..')) {
      throw new PrivacyRuleError('The private ledger has an entry that is not a vault-relative path');
    }
    priv.add(p);
  }
  return priv;
}

/** Whether a vault-relative path (NFC, '/') matches the private list */
export function isPrivate(rel: string, priv: ReadonlySet<string>): boolean {
  const r = nfc(rel);
  for (const n of priv) if (r === n || r.startsWith(n + '/')) return true;
  return false;
}

/** Whether any segment of the path looks like a secret name */
export const isSecretPath = (rel: string) => rel.split('/').some(seg => SECRET_RE.test(seg));

// Strings that look like local absolute paths: file: URLs, POSIX absolute paths (two+ segments), home (~/), Windows drive and UNC paths
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
 * Redact text before it reaches the browser: private full paths and their last name become [private], local absolute paths become [local path].
 * Both NFC and NFD forms are redacted. Names under three characters are redacted only when not surrounded by letters or digits, so parts of other words survive.
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
    let out = text.replace(ABS_PATH, '[local path]');
    if (re) out = out.replace(re, '[private]');
    return out;
  };
}
