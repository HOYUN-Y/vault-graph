// 데이터 출처 · 실제 볼트 연결 상태 표시와 수동 새로고침. 경로 · 이름은 보여 주지 않는다.
import type { LiveGraph } from '../data/live';

const time = (t: number | null) => (t ? new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '—');

/** 서버 사유 문구 끝에 마침표를 붙여 다음 문장과 이어 읽히지 않게 한다 */
const sentence = (text: string) => (/[.!?。]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/** short: 머리줄 꼬리표, tiny: 좁은 머리줄(1100px 이하)용 짧은 꼬리표(상태 · 기준 시각은 남김), long: 범례 · 알림 */
export interface LiveView { tone: 'demo' | 'ok' | 'warn' | 'bad'; short: string; tiny: string; long: string }

/** 상태 문구: 짧은 꼬리표(머리줄)와 긴 설명(범례 · 알림) */
/** pending: 첫 응답을 기다리는 중(데모 값을 실제처럼 잠깐이라도 보이지 않게 '확인 중'으로 둔다) */
export function liveView(live: LiveGraph | null, realMode: boolean, synthetic: string | null, pending = false): LiveView {
  if (pending && !synthetic) return CHECKING;
  if (synthetic) return { tone: 'demo', short: synthetic, tiny: '합성', long: `${synthetic}입니다. 실제 볼트와 무관합니다.` };
  if (!live || live.mode === 'demo') return { tone: 'demo', short: '데모 데이터', tiny: '데모', long: '실제 볼트 연결 없음: settings.json에 vaultPath가 없거나 ?demo=1로 열었습니다.' };
  if (live.state === 'connected' && realMode) return { tone: 'ok', short: `실제 볼트 · 읽기 전용 · ${time(live.updatedAt)}`, tiny: `실제 · ${time(live.updatedAt)}`, long: `실제 볼트에 읽기 전용으로 연결했습니다. 마지막 갱신 ${time(live.updatedAt)}, 변경을 자동으로 반영합니다.` };
  if (live.state === 'unavailable' && realMode) return { tone: 'warn', short: `연결 끊김 · ${time(live.updatedAt)} 기준`, tiny: `끊김 · ${time(live.updatedAt)} 기준`, long: `볼트에 닿지 못해 ${time(live.updatedAt)}에 검증한 화면을 보여 줍니다. 삭제로 판단하지 않으며, 다시 닿으면 자동으로 갱신합니다.` };
  if (live.state === 'blocked') return { tone: 'bad', short: '실제 볼트 차단 · 데모 표시', tiny: '차단 · 데모', long: `${sentence(live.reason ?? '비공개 규칙을 확인할 수 없어 실제 데이터를 차단했습니다')} 실제 자료는 보여 주지 않고 합성 데모를 표시합니다.` };
  if (live.state === 'invalid') return { tone: 'bad', short: '볼트 설정 오류 · 데모 표시', tiny: '설정 오류 · 데모', long: `${sentence(live.reason ?? '설정을 해석할 수 없습니다')} 합성 데모를 표시합니다.` };
  if (live.state === 'unavailable') return { tone: 'warn', short: '볼트에 닿지 못함 · 데모 표시', tiny: '닿지 못함 · 데모', long: `${sentence(live.reason ?? '볼트 폴더에 접근할 수 없습니다')} 검증된 실제 화면이 없어 합성 데모를 표시합니다.` };
  return CHECKING;
}
const CHECKING: LiveView = { tone: 'warn', short: '실제 볼트 연결 확인 중', tiny: '확인 중', long: '실제 볼트 연결을 확인하고 있습니다.' };

export function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M3 3h7v2H5v6h6V8h2v5H3V3zm8-1h3v3h-2V4h-1V2z" fill="currentColor" />
    </svg>
  );
}

export function LiveBadge({ view, canRefresh, refreshing, onRefresh }: { view: LiveView; canRefresh: boolean; refreshing: boolean; onRefresh(): void }) {
  return (
    <span className={`live live--${view.tone}`}>
      <span className="live__dot" aria-hidden="true" />
      <span className="live__text" title={view.long}><span className="live__full">{view.short}</span><span className="live__tiny">{view.tiny}</span></span>
      {canRefresh && (
        <button type="button" className="live__refresh" onClick={onRefresh} disabled={refreshing} aria-label="실제 볼트 다시 읽기" title="실제 볼트 다시 읽기">
          <RefreshIcon />
        </button>
      )}
    </span>
  );
}
