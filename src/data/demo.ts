// 합성 데모 데이터: 홍보 시연과 개발용 가상 볼트. 실제 자료 · 실제 운영 수치 · 실제 인물과 관계없다.
// 영역 · MOC 이름은 디자인용 예시이며 사용자의 실제 분류가 아니다. 모든 경로는 가상이며 디스크를 읽지 않는다.
//
// secondbrain-index-sync 구조를 따른 가상 파일 목록을 만든다.
//   - 볼트 최상위 안내 문서: CLAUDE.md · work.md · work--<주제>.md · moc-<주제>.md · project-<이름>.md
//   - 원문 자료: src-work/… · src-personal/… (라우터의 '외부 자료 폴더' 표에 등록한 가상 외부 폴더)
//   - 링크: [이름](링크를 쓴 문서 기준 상대경로). 그래프는 이 링크만 읽고 분류(주 소속)도 링크로 정한다.
// 아래 정의(seed)는 작성 편의용이다. 출력 파일에는 id · parent가 없고 색인 본문의 링크로만 남는다.
//   - parent: 주 분류로 올릴 색인(그 색인 본문 '하위 항목'에 링크가 생긴다 → 분류 소속)
//   - listedBy: 다른 위치의 색인에도 올림(→ 색인 연결)
//   - topics: 주제 MOC에 올림(→ 주제 연결)
//   - 자료 본문의 {{id|이름}}: 작성용 참조. 출력 때 그 자료까지의 상대경로 링크 [이름](…/파일.md)로 바뀐다(주제 연결)
import { relativeHref } from '../core/markdown';
import type { Dataset, NodeKind } from '../core/types';
import type { VaultFile } from '../core/vault';
import { expandHubs, expandMaterials, type Seed } from './demo-expand';
import { scaleHubs, scaleMaterials } from './demo-scale';


const seeds: Seed[] = [
  // ── 라우터 ──
  { id: 'router', kind: 'router', title: 'CLAUDE.md', path: 'CLAUDE.md', parent: null, updated: '2026-11-02',
    summary: '볼트 전체의 길잡이. 영역 색인과 주제 MOC로 가는 입구입니다.',
    body: '이 볼트에서 자료를 찾는 순서를 안내하는 라우터입니다. (데모용 가상 볼트)\n\n1. 무엇에 관한 자료인지 알면 영역 색인에서 찾습니다.\n2. 여러 영역에 걸친 주제라면 주제 MOC에서 찾습니다.\n3. 새 자료를 만들면 영역 색인과 관련 MOC 양쪽에 연결합니다.' },

  // ── 영역 색인 ──
  { id: 'area-work', kind: 'area', title: '업무', path: 'work.md', parent: 'router', updated: '2026-11-01',
    summary: '업무 영역 색인. 프로젝트 · 운영 · 콘텐츠로 나눴습니다.',
    body: '업무 영역의 색인입니다. 하위 색인을 먼저 고르고, 자주 찾는 문서는 아래에 바로 두었습니다.' },
  { id: 'area-personal', kind: 'area', title: '개인', path: 'personal.md', parent: 'router', updated: '2026-10-30',
    summary: '개인 영역 색인. 학습 · 기록 · 생활로 나눴습니다.',
    body: '개인 영역의 색인입니다. 공부한 것, 돌아본 것, 생활 계획을 나눠 둡니다.' },

  // ── 주제 MOC ──
  { id: 'moc-planning', kind: 'moc', title: '기획', path: 'moc-기획.md', parent: 'router', updated: '2026-10-28',
    summary: '기획에 관한 자료를 영역과 상관없이 모은 주제 지도입니다.', body: '목표를 정하고, 범위를 나누고, 결정을 남기는 자료를 모았습니다.' },
  { id: 'moc-dev', kind: 'moc', title: '개발', path: 'moc-개발.md', parent: 'router', updated: '2026-10-27',
    summary: '개발 · 데이터 관련 자료를 모은 주제 지도입니다.', body: '코드 · 데이터 · 품질 기준과 관련된 자료입니다.' },
  { id: 'moc-ai', kind: 'moc', title: 'AI 활용', path: 'moc-AI-활용.md', parent: 'router', updated: '2026-11-03',
    summary: 'AI 도구를 업무와 학습에 쓰는 방법을 모은 주제 지도입니다.', body: '업무에서 쓰는 지시문과 공부하며 정리한 내용을 한곳에서 봅니다.' },
  { id: 'moc-writing', kind: 'moc', title: '글쓰기', path: 'moc-글쓰기.md', parent: 'router', updated: '2026-10-25',
    summary: '글을 쓰고 다듬는 데 쓰는 자료를 모은 주제 지도입니다.', body: '문장 기준, 초안, 회고처럼 글로 남기는 자료입니다.' },

  // ── 업무 · 하위 색인 ──
  { id: 'work-projects', kind: 'subindex', title: '업무 · 프로젝트', path: 'work--projects.md', parent: 'area-work', updated: '2026-10-31',
    summary: '진행 중인 프로젝트의 안내 문서와 공통 체크리스트.', body: '프로젝트마다 안내 문서(README)에서 읽는 순서를 확인합니다.' },
  { id: 'work-ops', kind: 'subindex', title: '업무 · 운영', path: 'work--operations.md', parent: 'area-work', updated: '2026-11-02',
    summary: '팀 운영에 쓰는 양식과 기준 문서.', body: '회의 · 회고 · 장애 대응처럼 반복되는 운영 업무의 양식입니다.' },
  { id: 'work-content', kind: 'subindex', title: '업무 · 콘텐츠', path: 'work--content.md', parent: 'area-work', updated: '2026-10-29',
    summary: '발행하는 글 · 영상 · 뉴스레터 자료.', body: '발행 일정과 초안, 표현 기준을 모았습니다.' },

  // ── 개인 · 하위 색인 ──
  { id: 'personal-learning', kind: 'subindex', title: '개인 · 학습', path: 'personal--learning.md', parent: 'area-personal', updated: '2026-11-03',
    summary: '공부하며 정리한 노트와 스터디 안내.', body: '공부한 내용을 주제별로 정리합니다. 업무 자료라도 학습에 쓰면 여기에 함께 연결합니다.' },
  { id: 'personal-journal', kind: 'subindex', title: '개인 · 기록', path: 'personal--journal.md', parent: 'area-personal', updated: '2026-11-01',
    summary: '회고와 생각을 적어 두는 곳.', body: '주간 회고와 월간 돌아보기, 떠오른 아이디어를 적습니다.' },
  { id: 'personal-life', kind: 'subindex', title: '개인 · 생활', path: 'personal--life.md', parent: 'area-personal', updated: '2026-10-26',
    summary: '생활 기록과 계획.', body: '운동 · 예산 · 여행 · 요리처럼 생활에 쓰는 자료입니다.' },

  // ── 프로젝트 안내 ──
  { id: 'guide-nova', kind: 'guide', title: '노바 웹사이트 개편 안내', path: 'project-nova.md', parent: 'work-projects', updated: '2026-10-30',
    summary: '노바 웹사이트 개편 프로젝트(가상)의 문서 읽는 순서.', body: '기획서 → 정보 구조 → 회의록 순서로 읽습니다. 접근성 기준은 개발 전에 확정합니다.' },
  { id: 'guide-lumen', kind: 'guide', title: '루멘 지표 대시보드 안내', path: 'project-lumen.md', parent: 'work-projects', updated: '2026-10-24',
    summary: '팀 지표를 한 화면에서 보는 내부 대시보드 프로젝트(가상)의 안내.', body: '지표 정의 → 수집 → 회고 순서로 문서를 읽습니다.' },
  { id: 'guide-study-ml', kind: 'guide', title: '머신러닝 스터디 안내', path: 'project-ml-study.md', parent: 'personal-learning', updated: '2026-10-19',
    summary: '격주 토요일에 모이는 스터디(가상)의 주차별 정리 안내.', body: '주차별 정리를 순서대로 읽고, 참고 자료 목록은 계속 늘립니다.' },

  // ── 자료: 노바 ──
  { id: 'nova-brief', kind: 'material', title: '노바 개편 기획서', path: 'src-work/projects/nova/brief.md', parent: 'guide-nova', updated: '2026-10-08',
    topics: ['moc-planning'], summary: '첫 방문자가 30초 안에 서비스의 쓰임을 이해하게 만드는 개편 목표와 범위.',
    body: '# 노바 웹사이트 개편 기획서\n\n목표: 첫 방문자가 30초 안에 서비스의 쓰임을 이해하게 만든다.\n\n## 범위\n- 홈 · 요금 · 도입 사례 세 화면을 먼저 바꾼다.\n- 문의 양식은 기존 흐름을 유지한다.\n\n## 성공 기준\n- 문의 전환율과 체류 시간을 개편 전 4주와 비교한다.\n\n정보 구조는 {{nova-ia|노바 정보 구조 초안}}에서 이어서 다룬다.' },
  { id: 'nova-ia', kind: 'material', title: '노바 정보 구조 초안', path: 'src-work/projects/nova/ia.md', parent: 'guide-nova', updated: '2026-10-15',
    topics: ['moc-planning'], summary: '상단 메뉴를 다섯 개에서 세 개로 줄이는 정보 구조안.',
    body: '# 노바 정보 구조 초안\n\n상단 메뉴를 다섯 개에서 세 개로 줄인다: 제품 · 도입 사례 · 요금.\n\n- 제품: 기능 소개를 업무 흐름 순서로 다시 배열\n- 도입 사례: 업종별 필터\n- 요금: 비교표 하나로 통합\n\n근거와 범위는 {{nova-brief|노바 개편 기획서}}를 따른다.' },
  { id: 'nova-kickoff', kind: 'material', title: '노바 킥오프 회의록', path: 'src-work/projects/nova/meetings/2026-10-12.md', parent: 'guide-nova', updated: '2026-10-12',
    summary: '일정 · 범위 결정과 다음 할 일을 정리한 첫 회의 기록.',
    body: '# 노바 킥오프 회의록 · 2026-10-12\n\n참석: 기획 2, 디자인 1, 개발 2 (가상 인물)\n\n- 일정: 11월 첫 주 시안 공유, 12월 중순 공개\n- 결정: 문의 양식은 이번 범위에서 제외\n- 할 일: 접근성 기준을 먼저 정한다 → {{nova-a11y|노바 접근성 점검 목록}}\n\n배경 자료: {{nova-brief|노바 개편 기획서}}' },
  { id: 'nova-a11y', kind: 'material', title: '노바 접근성 점검 목록', path: 'src-work/projects/nova/a11y-checklist.md', parent: 'guide-nova', updated: '2026-10-20',
    topics: ['moc-dev'], summary: '키보드 · 대비 · 동작 줄이기 · 대체 텍스트 점검 항목.',
    body: '# 노바 접근성 점검 목록\n\n- [ ] 키보드만으로 모든 메뉴를 열고 닫을 수 있다\n- [ ] 본문 대비 4.5:1 이상\n- [ ] 동작 줄이기 설정에서 자동 재생을 멈춘다\n- [ ] 이미지 대체 텍스트를 문맥에 맞게 쓴다' },
  { id: 'nova-moodboard', kind: 'material', title: '노바 무드보드.png', path: 'src-work/projects/nova/노바 무드보드.png', parent: 'guide-nova', updated: '2026-10-10',
    format: 'image', summary: '색감과 사진 톤을 모은 이미지 보드. 데모에는 이미지 파일이 없고 설명만 있습니다.' },

  // ── 자료: 루멘 ──
  { id: 'lumen-metrics', kind: 'material', title: '루멘 핵심 지표 정의', path: 'src-work/projects/lumen/metrics.md', parent: 'guide-lumen', updated: '2026-09-30',
    topics: ['moc-planning', 'moc-dev'], summary: '주간 활성 사용자 · 기능 사용률 · 응답 시간의 정의와 집계 주기.',
    body: '# 루멘 핵심 지표 정의\n\n| 지표 | 정의 | 주기 |\n| --- | --- | --- |\n| 주간 활성 사용자 | 7일 안에 한 번 이상 로그인한 계정 수 | 매주 |\n| 기능 사용률 | 주요 기능을 한 번 이상 쓴 활성 사용자 비율 | 매주 |\n| 응답 시간 | 첫 화면이 그려지기까지 걸린 시간의 중앙값 | 매일 |\n\n수치와 지표는 모두 예시이며 실제 운영 값이 아닙니다.' },
  { id: 'lumen-pipeline', kind: 'material', title: '루멘 데이터 수집 파이프라인', path: 'src-work/projects/lumen/pipeline.md', parent: 'guide-lumen', updated: '2026-10-06',
    topics: ['moc-dev'], summary: '하루 한 번 사용 기록을 모아 지표로 집계하는 절차.',
    body: '# 루멘 데이터 수집 파이프라인\n\n1. 사용 기록을 하루 한 번 모은다.\n2. 개인 식별 정보는 수집 단계에서 지운다.\n3. {{lumen-metrics|루멘 핵심 지표 정의}}의 식으로 집계한다.\n\n실패하면 다음 실행에서 하루치를 다시 계산한다.' },
  { id: 'lumen-retro', kind: 'material', title: '루멘 1차 회고', path: 'src-work/projects/lumen/retro-1.md', parent: 'guide-lumen', updated: '2026-10-22',
    summary: '지표 합의는 빨랐지만 수집 지연을 늦게 알아챈 1차 개발 회고.',
    body: '# 루멘 1차 회고\n\n잘된 점: 지표 이름을 먼저 합의해 화면 논의가 짧아졌다.\n아쉬운 점: 수집 지연을 늦게 알아챘다 → {{lumen-pipeline|루멘 데이터 수집 파이프라인}}에 알림 단계를 추가.\n다음: 회고 형식은 {{ops-weekly-review|주간 회고}} 양식을 빌려 쓴다.' },
  { id: 'lumen-query', kind: 'material', title: '지표 쿼리 메모', path: 'src-work/projects/lumen/query-notes.md', parent: 'guide-lumen', updated: '2026-10-09',
    topics: ['moc-dev'], summary: '중복 제거 · 시간대 · 느린 쿼리에 관한 짧은 메모.',
    body: '# 지표 쿼리 메모\n\n- 주간 활성 사용자는 계정 기준으로 중복을 제거한다.\n- 시간대는 모두 KST로 맞춘다.\n- 느린 쿼리는 날짜 범위를 먼저 좁힌다.' },

  // ── 자료: 업무 · 프로젝트 공통 ──
  { id: 'projects-checklist', kind: 'material', title: '프로젝트 시작 체크리스트', path: 'src-work/projects/_checklist.md', parent: 'work-projects', updated: '2026-09-21',
    topics: ['moc-planning'], summary: '목표 · 결정권자 · 안내 문서 · MOC 연결을 확인하는 시작 점검표.',
    body: '# 프로젝트 시작 체크리스트\n\n- 목표와 성공 기준을 한 문장으로 적었다\n- 결정권자와 공유 주기를 정했다\n- 안내 문서(README)에 문서 읽는 순서를 적었다\n- 관련 주제 MOC에 새 자료를 연결했다' },

  // ── 자료: 업무 · 운영 ──
  { id: 'ops-weekly-review', kind: 'material', title: '주간 회고', path: 'src-work/operations/weekly-review.md', parent: 'work-ops', updated: '2026-10-31',
    summary: '끝낸 일 · 막힌 일 · 다음 주 우선순위를 적는 팀 회고 양식.',
    body: '# 주간 회고 (업무)\n\n1. 이번 주에 끝낸 일\n2. 막힌 일과 이유\n3. 다음 주에 먼저 할 일 세 가지\n\n회의 기록은 {{ops-meeting-prompt|회의록 요약 프롬프트}}로 먼저 정리한다.' },
  { id: 'ops-meeting-prompt', kind: 'material', title: '회의록 요약 프롬프트', path: 'src-work/operations/prompts/회의록 요약 프롬프트.md', parent: 'work-ops', updated: '2026-11-03',
    topics: ['moc-ai'], listedBy: ['personal-learning'],
    summary: '회의 기록을 결정 · 할 일 · 확인할 질문으로 정리하게 하는 지시문. 업무와 학습 양쪽에서 씁니다.',
    body: '# 회의록 요약 프롬프트\n\n아래 회의 기록을 읽고 다음 형식으로 정리해 주세요.\n\n- 결정된 것\n- 담당자와 기한이 있는 할 일\n- 다음 회의 전에 확인할 질문\n\n규칙: 기록에 없는 내용은 추측하지 말고 "확인 필요"로 표시합니다.\n\n개인 학습 정리에도 같은 틀을 씁니다 → {{learn-prompt-patterns|프롬프트 작성 패턴}}' },
  { id: 'ops-onboarding', kind: 'material', title: '신규 입사자 온보딩 안내', path: 'src-work/operations/onboarding.md', parent: 'work-ops', updated: '2026-10-14',
    topics: ['moc-writing'], summary: '첫 주에 읽을 문서와 질문하는 방법.',
    body: '# 신규 입사자 온보딩 안내\n\n첫 주에 읽을 문서\n1. {{work-faq|업무 자주 묻는 질문}}\n2. {{content-style|글쓰기 스타일 가이드}}\n3. {{ops-incident|장애 대응 기록 양식}}\n\n질문은 팀 채널에 남기면 담당자가 하루 안에 답합니다(예시).' },
  { id: 'ops-vendors', kind: 'material', title: '외부 협력사 목록', path: 'src-work/operations/vendors.md', parent: 'work-ops', updated: '2026-09-18',
    summary: '인쇄 · 번역 · 영상 협력사(모두 가상 회사) 목록.',
    body: '# 외부 협력사 목록\n\n모든 이름은 데모용 가상 회사입니다.\n\n- 바람인쇄 — 행사 인쇄물\n- 가람번역 — 영문 자료 번역\n- 새벽영상 — 홍보 영상 촬영' },
  { id: 'ops-incident', kind: 'material', title: '장애 대응 기록 양식', path: 'src-work/operations/incident-template.md', parent: 'work-ops', updated: '2026-10-02',
    topics: ['moc-dev'], summary: '발생 · 인지 · 복구 시각과 원인, 재발 방지 조치를 남기는 양식.',
    body: '# 장애 대응 기록 양식\n\n- 발생 시각 / 인지 시각 / 복구 시각\n- 영향 범위\n- 원인 (확인된 것과 추정을 구분)\n- 재발 방지 조치와 담당' },
  { id: 'ops-brand-guide', kind: 'material', title: '브랜드 가이드.pdf', path: 'src-work/operations/brand-guide.pdf', parent: 'work-ops', updated: '2026-08-29',
    format: 'pdf', listedBy: ['work-content'],
    summary: '로고 · 색상 · 서체 사용 규칙을 담은 PDF. 이 데모는 PDF 본문 보기를 지원하지 않습니다.' },

  // ── 자료: 업무 · 콘텐츠 ──
  { id: 'content-calendar', kind: 'material', title: '콘텐츠 발행 일정', path: 'src-work/content/calendar.md', parent: 'work-content', updated: '2026-10-29',
    topics: ['moc-planning'], summary: '11월 주차별 발행 형식과 주제.',
    body: '# 콘텐츠 발행 일정 · 11월\n\n| 주 | 형식 | 주제 |\n| --- | --- | --- |\n| 1주 | 뉴스레터 | 노바 개편 예고 |\n| 2주 | 블로그 | 접근성 점검에서 배운 것 |\n| 3주 | 영상 | 지표 대시보드 둘러보기 |\n| 4주 | 뉴스레터 | 11월 정리 |\n\n초안: {{content-newsletter|뉴스레터 11월호 초안}}' },
  { id: 'content-newsletter', kind: 'material', title: '뉴스레터 11월호 초안', path: 'src-work/content/newsletter-2026-11.md', parent: 'work-content', updated: '2026-11-02',
    topics: ['moc-writing'], summary: '노바 개편 소식을 담은 11월 뉴스레터의 제목 후보와 구성.',
    body: '# 뉴스레터 11월호 초안\n\n제목 후보\n- 더 짧게 읽히는 홈 화면을 만들고 있습니다\n- 노바 개편, 무엇을 덜어냈나\n\n본문은 {{content-style|글쓰기 스타일 가이드}}의 문장 규칙을 따른다.' },
  { id: 'content-style', kind: 'material', title: '글쓰기 스타일 가이드', path: 'src-work/content/style-guide.md', parent: 'work-content', updated: '2026-09-25',
    topics: ['moc-writing'], listedBy: ['personal-journal'], summary: '한 문장 한 내용 · 근거 있는 숫자 · 꾸밈말 줄이기 같은 문장 기준.',
    body: '# 글쓰기 스타일 가이드\n\n- 한 문장에는 한 가지 내용만 담는다.\n- 숫자에는 기준과 출처를 붙인다.\n- "혁신적인", "획기적인" 같은 꾸밈말을 줄인다.\n- 독자가 할 일을 마지막 문단에 적는다.' },
  { id: 'content-ai-images', kind: 'material', title: 'AI 이미지 생성 메모', path: 'src-work/content/ai-images.md', parent: 'work-content', updated: '2026-10-17',
    topics: ['moc-ai'], summary: '생성 이미지를 쓸 때 지키는 기준과 출처 표기.',
    body: '# AI 이미지 생성 메모\n\n- 실제 인물 · 상표를 닮은 이미지는 쓰지 않는다.\n- 생성 이미지에는 출처 표기를 남긴다.\n- 잘 된 지시문은 {{learn-prompt-patterns|프롬프트 작성 패턴}}에 옮겨 적는다.' },
  { id: 'content-interview', kind: 'material', title: '고객 인터뷰 정리', path: 'src-work/content/customer-interviews.md', parent: 'work-content', updated: '2026-10-05',
    topics: ['moc-planning'], summary: '가상 인터뷰 5건에서 나온 공통 불편과 기대.',
    body: '# 고객 인터뷰 정리 (가상 인터뷰 5건)\n\n- 공통 불편: 처음 화면에서 무엇을 눌러야 할지 모르겠다\n- 기대: 요금 비교를 한눈에 보고 싶다\n- 다음: {{nova-ia|노바 정보 구조 초안}}에 반영' },

  // ── 자료: 업무 영역 바로 아래 ──
  { id: 'work-faq', kind: 'material', title: '업무 자주 묻는 질문', path: 'src-work/faq.md', parent: 'area-work', updated: '2026-10-11',
    summary: '새 자료를 어디에 두고 어떻게 연결하는지에 관한 질문과 답.',
    body: '# 업무 자주 묻는 질문\n\nQ. 새 자료는 어디에 두나요?\nA. 원본은 원래 폴더(외부 자료 폴더 src-…)에 그대로 두고, 해당 색인에 한 줄 설명과 함께 링크만 겁니다.\n\nQ. 같은 자료를 여러 주제에서 쓰려면?\nA. 자료를 복사하지 않고 주제 MOC에서 링크만 겁니다.\n\nQ. 링크는 어떻게 적나요?\nA. `[보여 줄 이름](상대경로)` 형식으로, 링크를 쓰는 문서 위치를 기준으로 적습니다. 아래처럼 코드 안에 적은 예시는 실제 링크가 아닙니다.\n\n```\n- [예시 문서](src-work/예시.md) — 한 줄 설명\n```\n\n본문에 대괄호를 그대로 쓰려면 \\[이렇게](예시.md) 앞에 역슬래시를 붙입니다.' },

  // ── 자료: 개인 · 학습 ──
  { id: 'learn-prompt-patterns', kind: 'material', title: '프롬프트 작성 패턴', path: 'src-personal/learning/prompt-patterns.md', parent: 'personal-learning', updated: '2026-10-21',
    topics: ['moc-ai'], summary: '목적과 결과 형식을 먼저 적는 지시문 작성 습관.',
    body: '# 프롬프트 작성 패턴\n\n1. 역할보다 목적과 결과 형식을 먼저 적는다.\n2. 예시는 좋은 것 하나, 피할 것 하나.\n3. 모르면 모른다고 쓰게 한다.\n\n업무에서 쓰는 예: {{ops-meeting-prompt|회의록 요약 프롬프트}}' },
  { id: 'learn-viz-book', kind: 'material', title: '독서 메모 · 데이터 시각화 입문', path: 'src-personal/learning/reading/data-viz.md', parent: 'personal-learning', updated: '2026-09-27',
    topics: ['moc-dev'], summary: '색 · 축 · 기준선을 다루는 시각화 책(가상 도서) 메모.',
    body: '# 독서 메모 · 데이터 시각화 입문 (가상 도서)\n\n- 색은 범주를 나누는 데 쓰고, 순서를 나타낼 때는 밝기를 쓴다.\n- 축을 자르면 그 사실을 표시한다.\n- 같은 화면의 그래프는 같은 기준선을 쓴다.' },
  { id: 'learn-typescript', kind: 'material', title: '타입스크립트 학습 노트', path: 'src-personal/learning/typescript.md', parent: 'personal-learning', updated: '2026-10-13',
    topics: ['moc-dev'], summary: 'unknown 좁히기 · 판별 유니온 · satisfies 정리.',
    body: '# 타입스크립트 학습 노트\n\n- unknown으로 받은 값은 좁힌 뒤에 쓴다.\n- 판별 유니온으로 상태를 나누면 빠뜨린 분기를 컴파일러가 알려 준다.\n- satisfies는 타입을 넓히지 않고 모양만 검사한다.' },
  { id: 'learn-english', kind: 'material', title: '영어 표현 모음', path: 'src-personal/learning/english.md', parent: 'personal-learning', updated: '2026-10-04',
    summary: '회의에서 자주 듣는 영어 표현과 뜻.',
    body: '# 영어 표현 모음\n\n- circle back — 나중에 다시 이야기하다\n- low-hanging fruit — 쉽게 얻을 수 있는 성과\n- take it offline — 회의 밖에서 따로 논의하다' },

  // ── 자료: 머신러닝 스터디 ──
  { id: 'ml-week1', kind: 'material', title: '1주차 · 선형회귀 정리', path: 'src-personal/learning/ml-study/week-1.md', parent: 'guide-study-ml', updated: '2026-09-20',
    topics: ['moc-ai'], summary: '손실 함수와 경사 하강법, 학습률 정리.',
    body: '# 1주차 · 선형회귀 정리\n\n- 손실 함수: 평균 제곱 오차\n- 경사 하강법은 학습률이 너무 크면 발산한다\n- 다음 주: 분류 → {{ml-week2|2주차 · 분류와 평가 지표}}' },
  { id: 'ml-week2', kind: 'material', title: '2주차 · 분류와 평가 지표', path: 'src-personal/learning/ml-study/week-2.md', parent: 'guide-study-ml', updated: '2026-10-04',
    topics: ['moc-ai'], summary: '정밀도 · 재현율과 불균형 데이터에서의 평가.',
    body: '# 2주차 · 분류와 평가 지표\n\n- 정밀도: 양성이라 예측한 것 중 실제 양성의 비율\n- 재현율: 실제 양성 중 찾아낸 비율\n- 불균형 데이터에서는 정확도만 보지 않는다' },
  { id: 'ml-resources', kind: 'material', title: '스터디 참고 자료 목록', path: 'src-personal/learning/ml-study/resources.md', parent: 'guide-study-ml', updated: '2026-10-18',
    summary: '강의 노트 · 연습 문제 · 용어집 정리 현황.',
    body: '# 스터디 참고 자료 목록\n\n- 강의 노트 (데모에는 외부 링크를 넣지 않았습니다)\n- 연습 문제 묶음\n- 용어집 → {{ml-week1|1주차 · 선형회귀 정리}}부터 정리 중' },

  // ── 자료: 개인 · 기록 ──
  { id: 'journal-weekly-review', kind: 'material', title: '주간 회고', path: 'src-personal/journal/weekly-review.md', parent: 'personal-journal', updated: '2026-11-02',
    summary: '기분 한 줄 · 잘한 일 · 미룬 일을 적는 개인 회고 양식.',
    body: '# 주간 회고 (개인)\n\n- 이번 주 기분 한 줄\n- 잘한 일 하나, 미룬 일 하나\n- 다음 주에 지킬 작은 약속\n\n업무 회고와 이름은 같지만 다른 자료입니다.' },
  { id: 'journal-october', kind: 'material', title: '10월 돌아보기', path: 'src-personal/journal/2026-10.md', parent: 'personal-journal', updated: '2026-11-01',
    topics: ['moc-writing'], summary: '스터디 · 운동 · 회고 습관을 돌아본 월간 기록.',
    body: '# 10월 돌아보기\n\n- 스터디를 두 번 빠지지 않고 나갔다 → {{ml-week2|2주차 · 분류와 평가 지표}}\n- 운동은 주 2회로 줄었다 → {{life-workout|운동 루틴}}\n- 다음 달에는 {{journal-weekly-review|주간 회고}}를 일요일 저녁에 쓴다' },
  { id: 'journal-ideas', kind: 'material', title: '아이디어 메모장', path: 'src-personal/journal/ideas.md', parent: 'personal-journal', updated: '2026-10-23',
    topics: ['moc-planning'], summary: '언젠가 해 보고 싶은 작은 아이디어 목록.',
    body: '# 아이디어 메모장\n\n- 회의록을 자동으로 주제별 MOC에 연결하기\n- 읽은 책 메모를 한 장짜리 카드로 만들기\n- 뉴스레터에 독자 질문 코너 만들기 → {{content-calendar|콘텐츠 발행 일정}}' },
  { id: 'journal-whiteboard', kind: 'material', title: '화이트보드 스케치.png', path: 'src-personal/journal/whiteboard.png', parent: 'personal-journal', updated: '2026-10-23',
    format: 'image', summary: '아이디어를 정리하며 찍은 화이트보드 사진. 데모에는 이미지 파일이 없고 설명만 있습니다.' },
  { id: 'personal-goals', kind: 'material', title: '올해 목표', path: 'src-personal/goals.md', parent: 'area-personal', updated: '2026-09-01',
    topics: ['moc-planning'], summary: '스터디 완주 · 독서 · 운동 세 가지 목표.',
    body: '# 올해 목표\n\n1. 머신러닝 스터디 끝까지 참여하기 → {{guide-study-ml|머신러닝 스터디 안내}}\n2. 한 달에 책 두 권 읽기\n3. 주 3회 운동하기 → {{life-workout|운동 루틴}}' },

  // ── 자료: 개인 · 생활 ──
  { id: 'life-workout', kind: 'material', title: '운동 루틴', path: 'src-personal/life/workout.md', parent: 'personal-life', updated: '2026-10-16',
    summary: '요일별 근력 · 걷기 계획.',
    body: '# 운동 루틴\n\n- 월 · 목: 근력 40분\n- 화 · 토: 걷기 1시간\n- 무릎이 아프면 그 주는 걷기만 한다' },
  { id: 'life-budget', kind: 'material', title: '생활비 예산표', path: 'src-personal/life/budget.md', parent: 'personal-life', updated: '2026-10-01',
    summary: '고정비 · 변동비 분류와 비상금 규칙(예시).',
    body: '# 생활비 예산표 (예시)\n\n- 고정비: 주거 · 통신 · 보험\n- 변동비: 식비 · 교통 · 여가\n- 달마다 남은 금액의 절반은 비상금으로 옮긴다' },
  { id: 'life-trip', kind: 'material', title: '제주 여행 계획', path: 'src-personal/life/jeju-trip.md', parent: 'personal-life', updated: '2026-10-27',
    topics: ['moc-planning'], summary: '2박 3일 동쪽 일정과 비 오는 날 대안.',
    body: '# 제주 여행 계획\n\n- 일정: 2박 3일, 동쪽 위주\n- 비 오는 날 대안: 실내 전시 두 곳\n- 준비물 목록은 출발 전날 다시 확인' },
  { id: 'life-recipes', kind: 'material', title: '자주 만드는 요리', path: 'src-personal/life/recipes.md', parent: 'personal-life', updated: '2026-09-14',
    summary: '된장찌개 · 토마토 달걀 볶음 · 김치볶음밥 요령.',
    body: '# 자주 만드는 요리\n\n- 된장찌개: 멸치 육수 → 된장 → 애호박 · 두부\n- 토마토 달걀 볶음: 달걀을 먼저 반만 익혀 덜어 둔다\n- 김치볶음밥: 김치는 기름에 충분히 볶는다' }
];

// ── 반복 기록 시리즈(결정적 생성): 회의록 · 일일 기록 · 독서 메모처럼 실제 볼트에서 가장 많이 쌓이는 자료.
// 이름 · 내용은 모두 가상이며, 앞 기록과 이어지는 링크가 가지를 길게 만든다.
const pad = (n: number) => String(n).padStart(2, '0');
function series(): Seed[] {
  const out: Seed[] = [];
  const add = (s: Seed) => out.push(s);
  const chain = (prefix: string, i: number, prevTitle: (i: number) => string) => (i > 0 ? `\n\n이전 기록: {{${prefix}-${i - 1}|${prevTitle(i - 1)}}}` : '');

  const meeting = (i: number) => `팀 주간 회의 W${36 + i}`;
  const agendas = ['일정 점검', '막힌 일 공유', '다음 주 우선순위', '배포 전 확인', '회고 항목 정리', '외부 요청 분류'];
  for (let i = 0; i < 12; i++) add({ id: `ops-meeting-${i}`, kind: 'material', title: meeting(i), path: `src-work/operations/meetings/2026-W${36 + i}.md`, parent: 'work-ops',
    updated: `2026-${pad(9 + Math.floor(i / 5))}-${pad(1 + ((i * 7) % 27))}`, summary: `${agendas[i % agendas.length]} 중심의 주간 회의 기록(가상).`,
    body: `# ${meeting(i)}\n\n- 안건: ${agendas[i % agendas.length]} · ${agendas[(i + 2) % agendas.length]}\n- 결정: 담당자와 기한을 회의 안에서 정한다\n- 정리 방법: ${i % 4 === 0 ? '{{ops-meeting-prompt|회의록 요약 프롬프트}}로 요약' : '직접 요약'}${chain('ops-meeting', i, meeting)}` });

  const review = (i: number) => `노바 디자인 리뷰 ${i + 1}차`;
  const reviewTopics = ['홈 첫 화면', '요금 비교표', '도입 사례 필터', '모바일 메뉴', '접근성 대비', '문구 다듬기', '이미지 톤', '최종 점검'];
  for (let i = 0; i < 8; i++) add({ id: `nova-review-${i}`, kind: 'material', title: review(i), path: `src-work/projects/nova/reviews/review-${i + 1}.md`, parent: 'guide-nova',
    updated: `2026-10-${pad(14 + i * 2)}`, summary: `${reviewTopics[i]}을(를) 다룬 디자인 리뷰 기록(가상).`, topics: i === 4 ? ['moc-dev'] : undefined,
    body: `# ${review(i)}\n\n주제: ${reviewTopics[i]}\n\n- 유지: 메뉴 세 개 구조\n- 수정: ${reviewTopics[(i + 1) % 8]} 쪽 여백\n- 기준 문서: {{nova-ia|노바 정보 구조 초안}}${chain('nova-review', i, review)}` });

  const check = (i: number) => `지표 점검 ${pad(i + 1)}`;
  for (let i = 0; i < 10; i++) add({ id: `lumen-check-${i}`, kind: 'material', title: check(i), path: `src-work/projects/lumen/checks/check-${pad(i + 1)}.md`, parent: 'guide-lumen',
    updated: `2026-10-${pad(1 + i * 3)}`, summary: '수집 지연 · 누락 여부를 확인한 정기 점검 기록(가상 수치 없음).', topics: i % 5 === 2 ? ['moc-dev'] : undefined,
    body: `# ${check(i)}\n\n- 수집 지연: ${i % 3 === 0 ? '있음 → 다음 실행에서 재계산' : '없음'}\n- 누락 계정: 확인 완료\n${i % 2 === 0 ? '- 정의 확인: {{lumen-metrics|루멘 핵심 지표 정의}}\n' : ''}${chain('lumen-check', i, check)}` });

  const blogTopics = ['접근성 점검에서 배운 것', '메뉴를 줄이는 법', '지표 이름 정하기', '회의록을 짧게 쓰는 법', '첫 화면 문구', '인터뷰 질문 만들기', '데이터 표 읽기', '팀 회고 방식', '생성 이미지 쓰기', '11월 정리'];
  blogTopics.forEach((t, i) => add({ id: `content-blog-${i}`, kind: 'material', title: `블로그 초안 · ${t}`, path: `src-work/content/blog/draft-${pad(i + 1)}.md`, parent: 'work-content',
    updated: `2026-10-${pad(3 + i * 2)}`, summary: `"${t}"를 주제로 쓴 블로그 초안(가상).`, topics: i % 3 === 0 ? ['moc-writing'] : undefined,
    body: `# ${t}\n\n도입 · 사례 · 정리 세 문단으로 쓴다.\n\n문장 기준: {{content-style|글쓰기 스타일 가이드}}${i % 4 === 1 ? '\n일정: {{content-calendar|콘텐츠 발행 일정}}' : ''}` }));

  const books = ['느리게 배우는 법', '작은 습관의 힘(가상)', '질문하는 기술', '설계의 언어', '데이터와 이야기', '오래 쓰는 글', '기록의 쓸모', '함께 일하는 법', '숫자 읽기', '좋은 결정', '단순하게 만들기', '배움의 지도'];
  books.forEach((b, i) => add({ id: `learn-book-${i}`, kind: 'material', title: `독서 메모 · ${b}`, path: `src-personal/learning/reading/book-${pad(i + 1)}.md`, parent: 'personal-learning',
    updated: `2026-${pad(8 + Math.floor(i / 4))}-${pad(2 + i * 2)}`, summary: `가상 도서 "${b}"를 읽고 남긴 메모.`, topics: i % 4 === 0 ? ['moc-writing'] : i % 4 === 2 ? ['moc-planning'] : undefined,
    body: `# 독서 메모 · ${b}\n\n- 기억할 문장 하나\n- 내 일에 바로 쓸 것 하나\n- 더 찾아볼 질문 하나${i > 0 ? `\n\n함께 읽기: {{learn-book-${i - 1}|독서 메모 · ${books[i - 1]}}}` : ''}` }));

  const weeks = ['결정 트리', '앙상블', '군집', '차원 축소', '신경망 기초', '평가 다시 보기'];
  weeks.forEach((w, i) => add({ id: `ml-week-extra-${i}`, kind: 'material', title: `${i + 3}주차 · ${w}`, path: `src-personal/learning/ml-study/week-${i + 3}.md`, parent: 'guide-study-ml',
    updated: `2026-${pad(10 + Math.floor(i / 3))}-${pad(4 + (i % 3) * 9)}`, summary: `${w}을(를) 정리한 스터디 노트(가상).`, topics: ['moc-ai'],
    body: `# ${i + 3}주차 · ${w}\n\n- 핵심 개념 정리\n- 연습 문제 풀이\n\n지난 주: ${i === 0 ? '{{ml-week2|2주차 · 분류와 평가 지표}}' : `{{ml-week-extra-${i - 1}|${i + 2}주차 · ${weeks[i - 1]}}}`}` }));

  const day = (i: number) => `일일 기록 10월 ${i + 6}일`;
  const moods = ['맑음', '조금 피곤', '집중 잘 됨', '바쁨', '차분함', '산만함'];
  for (let i = 0; i < 24; i++) add({ id: `journal-day-${i}`, kind: 'material', title: day(i), path: `src-personal/journal/daily/2026-10-${pad(i + 6)}.md`, parent: 'personal-journal',
    updated: `2026-10-${pad(i + 6)}`, summary: `기분 · 한 일 · 내일 할 일을 적은 짧은 기록(가상).`, topics: i % 8 === 3 ? ['moc-writing'] : undefined,
    body: `# ${day(i)}\n\n기분: ${moods[i % moods.length]}\n한 일: ${i % 3 === 0 ? '스터디 정리' : i % 3 === 1 ? '운동' : '책 읽기'}${i % 7 === 0 ? '\n주간 정리: {{journal-weekly-review|주간 회고}}' : ''}${chain('journal-day', i, day)}` });

  const workout = (i: number) => `운동 기록 ${pad(i + 1)}`;
  for (let i = 0; i < 10; i++) add({ id: `life-workout-log-${i}`, kind: 'material', title: workout(i), path: `src-personal/life/workout/log-${pad(i + 1)}.md`, parent: 'personal-life',
    updated: `2026-10-${pad(2 + i * 3)}`, summary: '그날 한 운동과 컨디션 기록(가상).',
    body: `# ${workout(i)}\n\n- ${i % 2 === 0 ? '근력 40분' : '걷기 1시간'}\n- 컨디션: ${moods[(i + 2) % moods.length]}\n\n계획: {{life-workout|운동 루틴}}` });

  const ideas = ['검색 결과 미리보기', '주간 요약 자동화', '회의 안건 템플릿', '자료 정리 주간', '팀 용어집', '읽을거리 묶음'];
  ideas.forEach((t, i) => add({ id: `projects-idea-${i}`, kind: 'material', title: `아이디어 백로그 · ${t}`, path: `src-work/projects/backlog/idea-${pad(i + 1)}.md`, parent: 'work-projects',
    updated: `2026-10-${pad(5 + i * 4)}`, summary: `"${t}" 아이디어의 배경과 첫 단계(가상).`, topics: i % 2 === 0 ? ['moc-planning'] : undefined,
    body: `# 아이디어 · ${t}\n\n- 배경: 반복되는 일을 줄인다\n- 첫 단계: 작게 시험한다\n\n시작 전 확인: {{projects-checklist|프로젝트 시작 체크리스트}}` }));
  return out;
}

const KIND_HEADING: Record<NodeKind, string> = { router: '', area: '하위 색인 · 자주 찾는 문서', subindex: '하위 항목', guide: '자료', moc: '관련 자료', material: '' };
const REF = /\{\{([^|}]+)\|([^}]+)\}\}/g;
// 원문 자료 폴더(가상): 라우터의 '외부 자료 폴더' 표에 등록한다. 실제 경로 · 계정과 무관하다
const SOURCE_ROOTS = [
  { root: 'src-work', origin: '가상 업무 드라이브', area: '업무' },
  { root: 'src-personal', origin: '가상 개인 드라이브', area: '개인' },
  { root: 'src-research', origin: '가상 연구 드라이브', area: '연구' }
];

/** 안내 문서 본문을 정의에서 만든다: 머리말 + (주 분류 하위 목록 | MOC 관련 자료) + 다른 위치에서 함께 연결한 자료. 링크는 모두 상대경로 */
function compose(list: Seed[]): VaultFile[] {
  const byId = new Map(list.map(s => [s.id, s]));
  const byParent = new Map<string, Seed[]>();
  for (const s of list) if (s.parent) byParent.set(s.parent, [...(byParent.get(s.parent) ?? []), s]);
  return list.map(s => {
    const item = (t: Seed) => `- [${t.title}](${relativeHref(s.path, t.path)}) — ${t.summary}`;
    let body = (s.body ?? '').replace(REF, (_, id: string, label: string) => {
      const t = byId.get(id);
      if (!t) throw new Error(`데모 참조 오류: ${s.id} → ${id}`);
      return `[${label}](${relativeHref(s.path, t.path)})`;
    });
    if (s.kind !== 'material') {
      const sections: string[] = [`# ${s.title}`, body];
      if (s.kind === 'router') {
        const kids = byParent.get(s.id) ?? [];
        sections.push('## 영역 색인', kids.filter(k => k.kind === 'area').map(item).join('\n'));
        sections.push('## 주제 MOC', kids.filter(k => k.kind === 'moc').map(item).join('\n'));
        sections.push('## 프로젝트 안내', list.filter(k => k.kind === 'guide').map(item).join('\n'));
        sections.push('## 외부 자료 폴더 (가상)', ['| 링크 | 원본 위치 | 영역 |', '| --- | --- | --- |',
          ...SOURCE_ROOTS.map(r => `| [${r.root}](${r.root}) | ${r.origin} | ${r.area} |`)].join('\n'));
      } else if (s.kind === 'moc') {
        sections.push(`## ${KIND_HEADING.moc}`, list.filter(m => m.topics?.includes(s.id)).map(item).join('\n'));
      } else {
        const kids = byParent.get(s.id) ?? [];
        if (kids.length) sections.push(`## ${KIND_HEADING[s.kind]}`, kids.map(item).join('\n'));
        const listed = list.filter(m => m.listedBy?.includes(s.id));
        if (listed.length) sections.push('## 다른 위치에서 함께 연결한 자료', listed.map(item).join('\n'));
      }
      body = sections.filter(Boolean).join('\n\n');
    }
    if ((s.format ?? 'md') !== 'md') body = '';
    return { path: s.path, title: s.title, summary: s.summary, body, updated: s.updated };
  });
}

/** 1차 확장까지의 규모. 이 1,000개(수작업 대표 문서 + 반복 기록 + demo-expand.ts)는 경로 · 제목 · 자료 본문을 그대로 둔다 */
export const DEMO_CORE_COUNT = 1000;
/** 홍보 데모 규모(문서 수). 1,000개 둘레에 2차 확장(demo-scale.ts)의 영역 · 색인 · 시리즈를 더해 정확히 맞춘다 */
export const DEMO_DOC_COUNT = 5000;
const baseSeeds = [...seeds, ...series()];
const coreSeeds = [...baseSeeds, ...expandHubs, ...expandMaterials(DEMO_CORE_COUNT - baseSeeds.length - expandHubs.length)];
const mocUsed = new Map<string, number>();
for (const s of coreSeeds) for (const t of s.topics ?? []) mocUsed.set(t, (mocUsed.get(t) ?? 0) + 1);
const allSeeds = [...coreSeeds, ...scaleHubs, ...scaleMaterials(DEMO_DOC_COUNT - coreSeeds.length - scaleHubs.length, mocUsed)];
{
  const ids = new Set<string>();
  for (const s of allSeeds) { if (ids.has(s.id)) throw new Error(`데모 id 중복: ${s.id}`); ids.add(s.id); }
}
/** 검증용: 1차 확장까지의 1,000개만으로 만든 데모(2차 확장이 기존 자료 · 색인 줄을 바꾸지 않았는지 시험한다) */
export const demoCoreFiles = () => compose(coreSeeds);

export const demoDataset: Dataset = {
  label: '데모 볼트(합성 데이터)',
  synthetic: true,
  files: compose(allSeeds)
};

/** 검증용: 작성 정의의 주 분류(경로 → 상위 경로). 어댑터가 링크만으로 같은 분류를 찾는지 시험한다 */
export const DEMO_PRIMARY: ReadonlyMap<string, string | null> = new Map(allSeeds.map(s => [s.path, s.parent ? allSeeds.find(p => p.id === s.parent)!.path : null]));
