// First-screen intro: after the opening, shows the scale (demo docs · link count) and a first-action hint in large type where the opening chip was.
// Disappears on the first interaction (click · key press) or after a while. The numbers are marked as synthetic demo values so they don't read as real figures.
import { useEffect, useState } from 'react';
import { CloseIcon } from './icons';

/** Count up quickly from 0 to the target. Paused or reduced motion jumps straight to the target */
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
  /** Data tag (synthetic demo · synthetic performance data · real vault) */
  tag: string;
  /** Name for the doc count (demo docs · items) */
  docLabel: string;
  still: boolean;
  /** The 2D fallback omits the rotate hint */
  flat: boolean;
  onClose(): void;
}

export function Intro({ docs, edges, areas, topics, tag, docLabel, still, flat, onClose }: Props) {
  const d = useCountUp(docs, still), e = useCountUp(edges, still);
  return (
    <div className="intro" role="note" aria-label="Second Brain intro">
      <p className="intro__stats" aria-label={`${tag}: ${docs} ${docLabel}, ${edges} links, ${areas} areas, ${topics} topics`}>
        <span className="intro__stat" aria-hidden="true"><b>{d}</b>{docLabel}</span>
        <span className="intro__stat" aria-hidden="true"><b>{e}</b>links</span>
        <span className="intro__stat intro__stat--minor" aria-hidden="true"><b>{areas}</b>areas · <b>{topics}</b>topics</span>
        <span className="demo-tag" aria-hidden="true">{tag}</span>
      </p>
      <p className="intro__hint">
        Click a glowing dot to open its body and linked materials{!flat && <> · drag to rotate</>}<span className="intro__keys"> · <kbd>/</kbd> search</span>
      </p>
      <button type="button" className="intro__close" aria-label="Close intro" title="Close intro" onClick={onClose}><CloseIcon /></button>
    </div>
  );
}
