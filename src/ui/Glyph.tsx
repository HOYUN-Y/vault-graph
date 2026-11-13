// Kind glyphs: draws the same cell coordinates as the 3D voxel assemblies (render/voxel.ts SHAPE_CELLS) in isometric view. Shape is used along with color so kinds aren't told apart by color alone.
// Router = rounded cube cluster + ring, area index = 2×2×2 block, sub-index = 2×2 plate, project guide = stairs, topic MOC = 3D cross,
// material = a single cube (edges only for files without a body)
import type { DocFormat, NodeKind } from '../core/types';
import { voxelFaces } from './voxel-faces';

/** Files without a body (PDF · image) are drawn as edges only, with empty faces */
export const isHollow = (kind: NodeKind, format: DocFormat) => kind === 'material' && format !== 'md';

/** Voxel glyph within radius r (SVG fragment). bg: empty face · edge color */
export function VoxelMark({ kind, format = 'md', color, r, bg }: { kind: NodeKind; format?: DocFormat; color: string; r: number; bg: string }) {
  const hollow = isHollow(kind, format);
  const faces = voxelFaces(kind);
  return (
    <g transform={`scale(${r})`}>
      {kind === 'router' && <ellipse rx={1.18} ry={0.6} cy={0.18} fill="none" stroke={color} strokeWidth={0.07} strokeDasharray="0.12 0.1" opacity={0.75} />}
      {faces.map((face, i) => (
        <path key={i} d={face.d} fill={hollow ? bg : color} fillOpacity={hollow ? 1 : face.shade}
          stroke={hollow ? color : bg} strokeWidth={hollow ? 0.16 : kind === 'material' ? 0.06 : 0.09} strokeLinejoin="round" />
      ))}
    </g>
  );
}

export function Glyph({ kind, format = 'md', color, size = 14 }: { kind: NodeKind; format?: DocFormat; color: string; size?: number }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="-7 -7 14 14" aria-hidden="true" focusable="false">
      <VoxelMark kind={kind} format={format} color={color} r={kind === 'router' ? 5.6 : 6.3} bg="#0F1828" />
    </svg>
  );
}

/** Line sample for the legend */
export function LineSample({ kind, color }: { kind: 'primary' | 'index' | 'topic'; color: string }) {
  return (
    <svg className="line-sample" width={34} height={12} viewBox="0 0 34 12" aria-hidden="true" focusable="false">
      {kind === 'topic'
        ? <path d="M2,10 Q17,-2 32,10" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        : <path d="M2,6 H32" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeDasharray={kind === 'index' ? '4 4' : undefined} />}
    </svg>
  );
}
