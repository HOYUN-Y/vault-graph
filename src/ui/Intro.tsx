// 첫 화면 안내: 오프닝이 끝나면 오프닝 칩 자리에서 규모(가상 문서 · 연결 수)와 첫 행동 단서를 크게 보여 준다.
// 첫 조작(누르기 · 키 입력) 또는 잠시 뒤 사라진다. 수치는 합성 데모 값임을 함께 표시해 운영 수치로 보이지 않게 한다.
import { useEffect, useState } from 'react';
import { CloseIcon } from './icons';

/** 0에서 목표까지 빠르게 세어 올린다. 정지 · 동작 줄이기에서는 바로 목표 값 */
function useCountUp(target: number, still: boolean) {
  const [value, setValue] = useState(still ? target : 0);
  useEffect(() => {
    if (still) { setValue(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 1100);
      setValue(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, still]);
  return value;
}

interface Props {
  docs: number;
  edges: number;
  areas: number;
  topics: number;
  /** 데이터 표시 꼬리표(합성 데모 · 합성 성능 데이터 · 실제 볼트) */
  tag: string;
  /** 문서 수 이름(가상 문서 · 문서) */
  docLabel: string;
  still: boolean;
  /** 2D 대체 화면에서는 회전 안내를 뺀다 */
  flat: boolean;
  onClose(): void;
}

export function Intro({ docs, edges, areas, topics, tag, docLabel, still, flat, onClose }: Props) {
  const d = useCountUp(docs, still), e = useCountUp(edges, still);
  return (
    <div className="intro" role="note" aria-label="세컨드 브레인 안내">
      <p className="intro__stats" aria-label={`${tag}: ${docLabel} ${docs}개, 연결 ${edges}개, 영역 ${areas}개, 주제 ${topics}개`}>
        <span className="intro__stat" aria-hidden="true"><b>{d}</b>{docLabel}</span>
        <span className="intro__stat" aria-hidden="true"><b>{e}</b>연결</span>
        <span className="intro__stat intro__stat--minor" aria-hidden="true"><b>{areas}</b>영역 · <b>{topics}</b>주제</span>
        <span className="demo-tag" aria-hidden="true">{tag}</span>
      </p>
      <p className="intro__hint">
        빛나는 점을 누르면 본문과 연결 자료가 열립니다{!flat && <> · 끌어서 회전</>}<span className="intro__keys"> · <kbd>/</kbd> 검색</span>
      </p>
      <button type="button" className="intro__close" aria-label="안내 닫기" title="안내 닫기" onClick={onClose}><CloseIcon /></button>
    </div>
  );
}
