// Inline icons (no external icon pack)
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

export const SearchIcon = () => <svg {...base}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>;
export const CloseIcon = () => <svg {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const ChevronIcon = ({ up }: { up?: boolean }) => <svg {...base}><path d={up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg>;
export const LayersIcon = () => <svg {...base}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>;

/** Header mark: branches spreading from one nucleus */
export function BrandMark() {
  return (
    <svg className="brand__mark" width={30} height={30} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="brand-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F2FEFF" />
          <stop offset="60%" stopColor="#7DE6F5" />
          <stop offset="100%" stopColor="#7DE6F5" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g stroke="#58B8FF" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M16 16 Q9 13 5 7" /><path d="M16 16 Q10 21 6 26" />
      </g>
      <g stroke="#AC8DFF" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M16 16 Q23 12 27 6" /><path d="M16 16 Q22 21 26 27" />
      </g>
      <path d="M5 7 Q16 2 27 6" stroke="#F2BF77" strokeWidth="1" fill="none" opacity="0.75" />
      <circle cx="5" cy="7" r="2" fill="#58B8FF" /><circle cx="6" cy="26" r="1.6" fill="#58B8FF" />
      <circle cx="27" cy="6" r="2" fill="#AC8DFF" /><circle cx="26" cy="27" r="1.6" fill="#AC8DFF" />
      <circle cx="16" cy="16" r="6" fill="url(#brand-core)" />
    </svg>
  );
}
export const PlayIcon = () => <svg {...base}><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></svg>;
export const PauseIcon = () => <svg {...base}><path d="M8.5 5.5v13M15.5 5.5v13" /></svg>;
export const PlusIcon = () => <svg {...base}><path d="M12 5v14M5 12h14" /></svg>;
export const MinusIcon = () => <svg {...base}><path d="M5 12h14" /></svg>;
export const FitIcon = () => <svg {...base}><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /><circle cx="12" cy="12" r="2.5" /></svg>;
export const FoldIcon = () => <svg {...base}><path d="M7 4l5 5 5-5M7 20l5-5 5 5" /></svg>;
/** Labels: tag shape, with a slash when off */
export const LabelIcon = ({ off }: { off?: boolean }) => <svg {...base}><path d="M4 6.5h10.5l5 5.5-5 5.5H4z" /><path d="M8 12h4" />{off && <path d="M3.5 20.5 20.5 3.5" />}</svg>;
export const TourIcon = () => <svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="m10 8.8 5 3.2-5 3.2V8.8Z" /></svg>;
