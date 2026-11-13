// 실제 볼트 연결(브라우저 쪽): 같은 출처의 로컬 읽기 전용 API만 부른다. 경로 인수는 보내지 않고 불투명 ID만 쓴다.
import type { VaultFile } from '../core/vault';

export type LiveState = 'demo' | 'connecting' | 'connected' | 'unavailable' | 'blocked' | 'invalid';

export interface LiveStatus {
  mode: 'demo' | 'real';
  version: number;
  /** 볼트 식별값(경로 아님). 바뀌면 이전 실제 데이터 · 열린 본문 · 검색을 모두 버린다 */
  vaultKey: string | null;
  /** settings.json의 연결 방식: indexed(색인) · workspace(작업폴더). 작업폴더만 접힌 덩어리로 시작한다 */
  structure?: 'indexed' | 'workspace';
  state: LiveState;
  reason: string | null;
  /** 볼트에 닿지 못해 마지막으로 검증한 화면을 보여 주는 중 */
  stale: boolean;
  updatedAt: number | null;
  checkedAt: number | null;
  counts: { guides: number; materials: number; links: number; roots: number; privateRules: number; hiddenLinks: number; problems: number } | null;
  roots: number;
  problems: string[];
}

export interface LiveGraph extends LiveStatus {
  files: VaultFile[];
  /** 자료 ID → 메타데이터 확인 결과(ok · missing · unreachable · outside · denied · error · unchecked) */
  meta: Record<string, string>;
}

export type PreviewState = 'loading' | 'ok' | 'changed' | 'gone' | 'private' | 'blocked' | 'unsupported' | 'unregistered' | 'root-unavailable'
  | 'missing' | 'denied' | 'read-error' | 'offline' | 'outside' | 'not-file' | 'too-large' | 'timeout' | 'not-text' | 'demo' | 'error';
export interface Preview { state: PreviewState; body?: string; bytes?: number }

async function get<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', ...init }); // 서버가 Cache-Control: no-store로 응답한다
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

export const fetchStatus = () => get<LiveStatus>('/api/vault/status');
export const fetchGraph = () => get<LiveGraph>('/api/vault/graph');
export const requestRefresh = () => get<LiveStatus>('/api/vault/refresh', { method: 'POST' });
export async function fetchPreview(id: string): Promise<Preview> {
  return (await get<Preview>(`/api/vault/doc/${encodeURIComponent(id)}`)) ?? { state: 'error' };
}

/** 사용자에게 보여 줄 미리보기 상태 문구(경로 · 이름 없이) */
export const PREVIEW_MESSAGE: Record<PreviewState, string> = {
  loading: '원문을 읽는 중입니다…',
  ok: '',
  changed: '읽는 사이 볼트 설정이나 비공개 규칙이 바뀌어 본문을 보여 주지 않았습니다. 다시 선택해 주세요.',
  gone: '이 자료는 더 이상 색인에 없습니다.',
  private: '비공개 규칙에 걸려 본문을 열지 않습니다.',
  blocked: '비공개 규칙을 확인할 수 없어 본문을 열지 않습니다.',
  unsupported: '이 형식은 본문 미리보기를 지원하지 않습니다(Markdown · 텍스트만). 색인 설명만 보여 줍니다.',
  unregistered: '라우터에 등록되지 않은 외부 폴더라 본문을 열지 않습니다.',
  'root-unavailable': '외부 자료 폴더에 닿지 못했습니다. 드라이브가 꺼져 있거나 오프라인일 수 있습니다(삭제로 판단하지 않음).',
  missing: '원문 파일이 없습니다. 이동되었거나 삭제되었을 수 있습니다.',
  denied: '원문을 읽을 권한이 없습니다(파일 · 폴더 권한). 삭제로 판단하지 않습니다.',
  'read-error': '원문을 읽는 중 입출력 오류가 났습니다. 잠시 뒤 다시 선택해 주세요(삭제로 판단하지 않음).',
  offline: '볼트 연결이 끊겨 원문을 읽지 못했습니다. 다시 닿으면 자동으로 갱신합니다(삭제로 판단하지 않음).',
  outside: '원문이 허용된 작업폴더와 등록 외부 폴더 밖을 가리켜 열지 않습니다.',
  'not-file': '폴더나 특수 파일이라 본문이 없습니다.',
  'too-large': '파일이 커서(512KB 초과) 미리보기를 생략했습니다.',
  timeout: '원문을 제때 읽지 못했습니다. 온라인 전용 파일이거나 드라이브가 느릴 수 있습니다.',
  'not-text': 'UTF-8 텍스트가 아니라 미리보기를 생략했습니다.',
  demo: '',
  error: '미리보기를 불러오지 못했습니다. 연결 상태를 확인해 주세요.'
};
