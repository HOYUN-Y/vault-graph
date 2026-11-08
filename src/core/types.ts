// 세컨드 브레인 데이터 타입. 브라우저 · 렌더러에 의존하지 않는다(Node 테스트에서 그대로 쓴다).
import type { VaultFile } from './vault';

/** 라우터(CLAUDE.md) · 영역 색인 · 하위 색인 · 프로젝트 안내 · 주제 MOC · 일반 자료 */
export type NodeKind = 'router' | 'area' | 'subindex' | 'guide' | 'moc' | 'material';

/** 본문을 보여 줄 수 있는 형식은 md(UTF-8 텍스트)뿐이다. pdf · image · 기타 파일 · 원문 폴더는 설명만 보여 준다 */
export type DocFormat = 'md' | 'pdf' | 'image' | 'other' | 'dir';

/** 볼트 어댑터(vault.ts)가 파일 목록에서 만든 문서. 원문 위치(path)와 분류(parent)는 서로 다른 정보다 */
export interface BrainDoc {
  /** 정규 경로에서 만든 불투명 고유 ID. 같은 원문을 여러 색인이 연결해도 노드는 이 값 하나로 유지한다 */
  id: string;
  /** 경로 규칙으로 정한 종류(vault.ts kindOfPath) */
  kind: NodeKind;
  title: string;
  /** 원문 위치: 볼트 기준 정규 경로(NFC). 안내 문서는 최상위, 원문 자료는 src-<이름>/…(데모는 모두 가상 경로) */
  path: string;
  /** 주 분류: 색인 링크로 정한 논리 상위 문서 ID. 실제 디스크 폴더와 무관하다. 라우터 · 닿지 않는 문서는 null */
  parent: string | null;
  /** 한 줄 설명(색인 문구) */
  summary: string;
  /** UTF-8 본문. 관계는 표준 Markdown 링크 [이름](문서 기준 상대경로)에서만 나온다 */
  body: string;
  format: DocFormat;
  /** YYYY-MM-DD */
  updated: string;
}

export interface Dataset {
  label: string;
  /** 합성 데모 데이터 여부. 데모 수치를 실제 운영 값처럼 표시하지 않는 데 쓴다 */
  synthetic: boolean;
  /** 가상 볼트 파일 목록(경로 · 본문). 디스크를 읽지 않는다 */
  files: VaultFile[];
}

/** 분류 소속(주 분류 색인 → 문서) · 색인 연결(다른 색인이 함께 연결) · 주제 연결(MOC · 문서 사이 링크). 디스크 폴더 관계는 없다 */
export type EdgeKind = 'primary' | 'index' | 'topic';

/** 화면 선(그리기 전용): 같은 쌍의 관계를 하나로 합친 것. 관계 자체는 graph.ts의 Relation */
export interface Edge {
  /** 방향과 무관한 쌍 키 */
  key: string;
  /** 대표 관계의 방향 */
  source: string;
  target: string;
  /** 대표 종류(분류 소속 > 색인 > 주제) */
  kind: EdgeKind;
  /** 이 쌍에 합쳐진 모든 종류 */
  kinds: EdgeKind[];
}

/** 연결 보기: 전체 · 영역 구조(분류 소속 + 색인 연결) · 주제 연결 */
export type EdgeView = 'all' | 'structure' | 'topic';

/** 다른 자료를 목록으로 묶는 색인 계열 문서 */
export const INDEX_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(['router', 'area', 'subindex', 'guide']);

export const isPreviewable = (doc: BrainDoc) => doc.format === 'md';
