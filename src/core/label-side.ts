// 장면 이름표의 좌우 자리 판정. 화면 중심선 근처에서는 직전 방향을 그대로 써서
// 투영 좌표의 부동소수점 오차(예: 873.9999… ↔ 874.0000…)나 미세한 흔들림으로 좌우가 왕복하지 않게 한다.

/** 중심선 양쪽 데드밴드 폭(px): 이 안에서는 방향을 바꾸지 않는다 */
export const LABEL_SIDE_BAND = 24;

/** true = 노드 오른쪽, false = 왼쪽. prev는 같은 노드의 직전 방향(처음이면 undefined) */
export function labelSide(x: number, mid: number, prev: boolean | undefined, band = LABEL_SIDE_BAND): boolean {
  if (prev === undefined || Math.abs(x - mid) >= band) return x >= mid;
  return prev;
}

// ── 시간 안정화: 회전 중 겹침이 잠깐 생겼다 풀리며 이름표가 한두 프레임 숨었다 보이거나 좌우로 오가지 않게 한다 ──

/** 최소 유지 시간(ms): 새로 보이기 전 빈자리 유지 · 겹친 채 버티기 */
export const LABEL_HOLD_MS = 250;
/** 좌우를 한 번 바꾼(또는 처음 보인) 뒤 다시 바꾸기까지의 최소 시간(ms). 이 안에서는 쪽을 바꾸지 않고 버티거나 숨는다(짧은 왕복 방지) */
export const LABEL_SIDE_LOCK_MS = 1000;

/** 0 = 빈자리, 1 = 다른 이름표와 겹침(잠시 버틸 수 있음), 2 = 놓을 수 없음(화면 · 안전 영역 밖, 조작 막대, 라우터 조립 — 바로 비킨다) */
export type LabelBlock = 0 | 1 | 2;

export interface LabelHold {
  /** 지금 보이는가 */
  shown: boolean;
  /** 마지막으로 보인 쪽(true = 오른쪽) */
  side: boolean;
  /** 보이는 쪽이 마지막으로 바뀐(또는 처음 보인) 시각. 숨었다 같은 쪽에 다시 보이면 그대로 둔다(한 번도 안 보였으면 −∞) */
  movedAt: number;
  /** 겹친 채 버티기 시작한 시각(0 = 겹치지 않음) */
  clashAt: number;
  /** 숨은 이름표에 빈자리가 처음 난 시각(0 = 자리 없음) */
  freeAt: number;
}

/** hold = 계속 움직이는 중(시간 안정화), show = 새 이름표는 기다리지 않음(이름표 켬 · 선택 · 가리킴 · 데이터 · 크기 바뀜 직후), settle = 움직임이 멈춘 프레임(기다림 · 버팀 · 잠금 없이 바로) */
export type LabelPace = 'hold' | 'show' | 'settle';

/**
 * 한 이름표의 이번 프레임 자리. side = 보일 쪽(null = 숨김), wait = 빈자리가 유지 시간 동안 이어지기를 기다리는 중.
 * - want: 좌우 판정(중심선을 넘지 않았으면 직전에 놓은 쪽)
 * - pace: 위 LabelPace
 * 화면 밖 · 숨김 · 삭제 · 비공개 · 출처 전환 · 이름표 끔은 이 함수에 오지 않고 부르는 쪽이 바로 지운다.
 */
export function holdLabel(prev: LabelHold | undefined, want: boolean, block: (side: boolean) => LabelBlock, now: number, pace: LabelPace, hold = LABEL_HOLD_MS, lock = LABEL_SIDE_LOCK_MS): { side: boolean | null; wait: boolean; next: LabelHold } {
  const settle = pace === 'settle';
  // 쪽을 바꿔도 되는가: 처음이거나, 움직임이 멈췄거나, 마지막으로 쪽이 바뀐 뒤 잠금 시간이 지났다
  const free = !prev || settle || now - prev.movedAt >= lock;
  const show = (side: boolean) => ({ side, wait: false, next: { shown: true, side, movedAt: prev && prev.side === side && Number.isFinite(prev.movedAt) ? prev.movedAt : now, clashAt: 0, freeAt: 0 } });
  const hide = (freeAt = 0) => ({ side: null, wait: freeAt > 0, next: { shown: false, side: prev?.side ?? want, movedAt: prev?.movedAt ?? -Infinity, clashAt: 0, freeAt } });
  if (prev?.shown) {
    const s = prev.side;
    // 중심선을 넘어 원하는 쪽이 바뀌면 한 번 옮긴다(잠금 시간 뒤)
    if (want !== s && free && block(want) === 0) return show(want);
    const here = block(s);
    if (here === 0) return show(s);
    // 다른 이름표와 겹치기만 했으면 유지 시간 동안 그 자리에서 버틴다(곧 풀리는 겹침에 숨거나 반대쪽으로 갔다 오지 않게)
    if (here === 1 && !settle) {
      const clashAt = prev.clashAt || now;
      if (now - clashAt < hold) return { side: s, wait: false, next: { ...prev, clashAt } };
    }
    // 오래 겹치거나 놓을 수 없는 자리(곧바로): 잠금 시간이 지났고 반대쪽이 비었으면 한 번 옮기고, 아니면 숨긴다
    if (free && block(!s) === 0) return show(!s);
    return hide();
  }
  // 숨은 이름표: 잠금 시간 안에는 마지막으로 보인 쪽에만 다시 보인다(다른 쪽에 다시 나타나는 것도 쪽 바꿈)
  const options = free ? [want, !want] : [prev!.side];
  const side = options.find(o => block(o) === 0);
  if (side === undefined) return hide();
  // 빈자리가 유지 시간 동안 이어질 때만 보인다(한두 프레임만 나는 자리에 잠깐 나타났다 사라지지 않게)
  const freeAt = prev?.freeAt || now;
  if (pace !== 'hold' || now - freeAt >= hold) return show(side);
  return hide(freeAt);
}
