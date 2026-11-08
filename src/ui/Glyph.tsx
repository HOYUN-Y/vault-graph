// 종류별 표식: 3D 복셀 조립(render/voxel.ts SHAPE_CELLS)과 같은 칸 좌표를 등각으로 그린다. 색만으로 종류를 구분하지 않도록 조립 형태를 함께 쓴다.
// 라우터 = 둥근 큐브 덩어리 + 고리, 영역 색인 = 2×2×2 블록, 하위 색인 = 2×2 판, 프로젝트 안내 = 계단, 주제 MOC = 입체 십자,
// 자료 = 정육면체 하나(본문 없는 파일은 모서리만)
import type { DocFormat, NodeKind } from '../core/types';
import { voxelFaces } from './voxel-faces';

/** 본문 없는 파일(PDF · 이미지)은 면을 비우고 모서리만 그린다 */
export const isHollow = (kind: NodeKind, format: DocFormat) => kind === 'material' && format !== 'md';

/** 반지름 r 안의 복셀 표식(SVG 조각). bg: 빈 면 · 모서리 색 */
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

/** 범례용 선 견본 */
export function LineSample({ kind, color }: { kind: 'primary' | 'index' | 'topic'; color: string }) {
  return (
    <svg className="line-sample" width={34} height={12} viewBox="0 0 34 12" aria-hidden="true" focusable="false">
      {kind === 'topic'
        ? <path d="M2,10 Q17,-2 32,10" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        : <path d="M2,6 H32" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeDasharray={kind === 'index' ? '4 4' : undefined} />}
    </svg>
  );
}
