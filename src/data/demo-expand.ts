// 합성 데모 데이터 확장: 홍보 시연용 가상 볼트를 1,000개 문서 규모로 늘린다. 실제 자료 · 실제 인물 · 실제 회사 · 실제 도서/논문과 관계없다.
// demo.ts의 수작업 대표 문서(노바 · 루멘 · 회의록 요약 프롬프트 · 스터디 등)는 그대로 두고, 그 주변에
// 실제 볼트에서 많이 쌓이는 반복 기록 · 프로젝트 자료 · 생활 기록을 결정적으로(난수 없이) 더한다.
//   - 새 안내 문서: 연구 영역 · 주제 MOC 4개 · 하위 색인(100줄을 넘지 않게 주제별로 나눔) · 프로젝트 안내
//   - 각 자료는 주 분류 색인 하나(parent)에 올리고, 필요하면 다른 색인(listedBy) · 주제 MOC(topics) · 본문 링크로 잇는다
//   - listedBy는 주 분류보다 얕은 색인에 두지 않는다(링크 너비 우선 분류가 작성 정의와 같은 주 분류를 찾게)
import type { DocFormat, NodeKind } from '../core/types';

export interface Seed {
  id: string;
  kind: NodeKind;
  title: string;
  /** 가상 볼트 기준 경로(안내 문서는 최상위, 원문은 src-*) */
  path: string;
  /** 작성용: 주 분류로 올릴 색인 id */
  parent: string | null;
  summary: string;
  /** 색인 · MOC는 머리말, 자료는 본문 전체 */
  body?: string;
  format?: DocFormat;
  updated: string;
  topics?: string[];
  listedBy?: string[];
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const BASE = Date.UTC(2026, 10, 5);
/** 2026-11-05에서 back일 전 날짜(YYYY-MM-DD) */
const ago = (back: number) => new Date(BASE - back * 86400000).toISOString().slice(0, 10);
const at = <T,>(list: readonly T[], i: number) => list[((i % list.length) + list.length) % list.length];
const when = (cond: boolean, ...ids: string[]) => (cond ? ids : []);
const opt = (list: string[]) => (list.length ? list : undefined);
const ref = (id: string, title: string) => `{{${id}|${title}}}`;

/** 새 안내 문서(영역 · 하위 색인 · 프로젝트 안내 · 주제 MOC) */
export const expandHubs: Seed[] = [
  { id: 'area-research', kind: 'area', title: '연구', path: 'research.md', parent: 'router', updated: '2026-11-04',
    summary: '연구 영역 색인. 논문 메모 · 실험 기록 · 데이터셋 카드로 나눴습니다.',
    body: '연구 영역의 색인입니다. 읽은 논문, 직접 해 본 실험, 쓰는 데이터를 나눠 두고 방법은 주제 MOC에서 모읍니다. (모든 논문 · 데이터는 가상입니다)' },

  { id: 'moc-design', kind: 'moc', title: '디자인', path: 'moc-디자인.md', parent: 'router', updated: '2026-11-02',
    summary: '화면 · 시안 · 사용성 시험 자료를 영역과 상관없이 모은 주제 지도입니다.', body: '화면 명세, 시안, 사용성 시험에서 나온 결정을 한곳에서 봅니다.' },
  { id: 'moc-method', kind: 'moc', title: '연구 방법', path: 'moc-연구-방법.md', parent: 'router', updated: '2026-11-04',
    summary: '실험 설계 · 설문 · 평가 방법을 모은 주제 지도입니다.', body: '가설을 세우고, 측정하고, 결과를 의심하는 방법을 모았습니다.' },
  { id: 'moc-retro', kind: 'moc', title: '회고', path: 'moc-회고.md', parent: 'router', updated: '2026-11-03',
    summary: '업무 · 개인 회고와 사후 분석을 모은 주제 지도입니다.', body: '잘된 점과 아쉬운 점, 다음에 바꿀 한 가지를 남긴 기록입니다.' },
  { id: 'moc-health', kind: 'moc', title: '건강', path: 'moc-건강.md', parent: 'router', updated: '2026-11-01',
    summary: '운동 · 수면 · 식단 기록을 모은 주제 지도입니다.', body: '몸을 돌보는 습관과 그 기록을 모았습니다.' },

  // ── 업무 ──
  { id: 'guide-orbit', kind: 'guide', title: '오르빗 모바일 앱 출시 안내', path: 'project-orbit.md', parent: 'work-projects', updated: '2026-11-03',
    summary: '일정 관리 모바일 앱 오르빗(가상)의 출시 준비 문서 읽는 순서.', body: '화면 명세 → QA 기록 → 출시 노트 순서로 읽습니다. 시안 이미지는 설명만 있습니다.' },
  { id: 'guide-atlas', kind: 'guide', title: '아틀라스 사내 검색 개선 안내', path: 'project-atlas.md', parent: 'work-projects', updated: '2026-10-29',
    summary: '사내 문서 검색 아틀라스(가상)의 검색어 분석과 관련도 실험 안내.', body: '검색어 분석 → 관련도 실험 → 동의어 사전 순서로 읽습니다.' },
  { id: 'guide-harbor', kind: 'guide', title: '하버 고객 지원 자동화 안내', path: 'project-harbor.md', parent: 'work-projects', updated: '2026-10-31',
    summary: '고객 문의 자동 응답 하버(가상)의 답변 초안 · 분류 · 시험 안내.', body: '문의 분류 → 답변 초안 → 대화 시나리오 시험 순서로 읽습니다. 사람이 마지막에 확인합니다.' },
  { id: 'work-ops-meetings', kind: 'subindex', title: '업무 · 운영 · 회의록 보관', path: 'work--operations--meetings.md', parent: 'work-ops', updated: '2026-11-02',
    summary: '지난 주간 회의록을 주차 순서로 모은 보관 색인.', body: '최근 회의록은 운영 색인에, 그 이전 기록은 여기에 둡니다.' },
  { id: 'work-ops-incidents', kind: 'subindex', title: '업무 · 운영 · 장애 기록', path: 'work--operations--incidents.md', parent: 'work-ops', updated: '2026-10-30',
    summary: '장애 대응 기록 양식으로 남긴 사건 기록 모음.', body: '사건마다 원인과 재발 방지 조치를 남깁니다. 양식은 운영 색인에 있습니다.' },
  { id: 'work-clients', kind: 'subindex', title: '업무 · 고객사', path: 'work--clients.md', parent: 'area-work', updated: '2026-10-28',
    summary: '고객사(모두 가상 회사)별 미팅 · 요구사항 · 제안 기록.', body: '고객사마다 첫 미팅부터 회고까지 같은 순서로 정리합니다.' },
  { id: 'work-newsletter', kind: 'subindex', title: '업무 · 콘텐츠 · 뉴스레터', path: 'work--content--newsletter.md', parent: 'work-content', updated: '2026-11-01',
    summary: '지난 뉴스레터 호를 발행 순서로 모은 색인.', body: '이번 달 초안은 콘텐츠 색인에, 발행한 호는 여기에 둡니다.' },
  { id: 'work-video', kind: 'subindex', title: '업무 · 콘텐츠 · 영상 · 소셜', path: 'work--content--video.md', parent: 'work-content', updated: '2026-10-26',
    summary: '영상 대본과 짧은 소셜 게시물 기록.', body: '대본은 한 화면에 한 문장 기준으로 씁니다.' },

  // ── 개인 ──
  { id: 'personal-reading', kind: 'subindex', title: '개인 · 학습 · 독서', path: 'personal--learning--reading.md', parent: 'personal-learning', updated: '2026-11-02',
    summary: '가상 도서 독서 메모를 모은 색인.', body: '책 한 권에 메모 하나. 다른 영역에서 쓰는 메모는 함께 연결해 둡니다.' },
  { id: 'personal-courses', kind: 'subindex', title: '개인 · 학습 · 온라인 강의', path: 'personal--learning--courses.md', parent: 'personal-learning', updated: '2026-10-27',
    summary: '온라인 강의(가상)를 강의별로 정리한 노트.', body: '강의마다 한 줄 요약과 연습한 것을 남깁니다.' },
  { id: 'guide-japanese', kind: 'guide', title: '일본어 공부 안내', path: 'project-japanese.md', parent: 'personal-learning', updated: '2026-10-30',
    summary: '하루 20분 일본어 공부(가상 교재)의 과별 노트 안내.', body: '과 노트를 순서대로 보고, 단어장은 주말에 다시 봅니다.' },
  { id: 'personal-daily', kind: 'subindex', title: '개인 · 기록 · 일일 기록 보관', path: 'personal--journal--daily.md', parent: 'personal-journal', updated: '2026-10-05',
    summary: '10월 이전 일일 기록을 날짜 순서로 모은 보관 색인.', body: '최근 일일 기록은 기록 색인에, 그 이전은 여기에 둡니다.' },
  { id: 'personal-reviews', kind: 'subindex', title: '개인 · 기록 · 회고 모음', path: 'personal--journal--reviews.md', parent: 'personal-journal', updated: '2026-11-02',
    summary: '주간 · 월간 회고를 모은 색인.', body: '주간 회고 양식으로 쓴 기록과 월간 돌아보기를 함께 둡니다.' },
  { id: 'personal-health', kind: 'subindex', title: '개인 · 생활 · 건강', path: 'personal--life--health.md', parent: 'personal-life', updated: '2026-11-01',
    summary: '운동 기록 · 수면 메모와 달리기 준비.', body: '운동 루틴을 따라 한 기록과 수면 메모를 둡니다.' },
  { id: 'guide-running', kind: 'guide', title: '하프 마라톤 준비 안내', path: 'project-half-marathon.md', parent: 'personal-health', updated: '2026-10-31',
    summary: '12주 하프 마라톤 준비(가상 대회)의 훈련 기록 안내.', body: '주차별 훈련 기록을 순서대로 읽습니다. 무릎이 아프면 그 주는 쉽니다.' },
  { id: 'personal-finance', kind: 'subindex', title: '개인 · 생활 · 가계', path: 'personal--life--finance.md', parent: 'personal-life', updated: '2026-11-01',
    summary: '달마다 생활비 예산표로 점검한 기록(예시).', body: '예산표 기준으로 달마다 한 번 점검합니다. 금액은 적지 않습니다.' },
  { id: 'personal-kitchen', kind: 'subindex', title: '개인 · 생활 · 요리', path: 'personal--life--kitchen.md', parent: 'personal-life', updated: '2026-10-25',
    summary: '해 본 요리와 장보기 요령.', body: '자주 만드는 요리는 생활 색인에, 새로 해 본 요리는 여기에 둡니다.' },
  { id: 'personal-travel', kind: 'subindex', title: '개인 · 생활 · 여행', path: 'personal--life--travel.md', parent: 'personal-life', updated: '2026-10-20',
    summary: '다녀온 여행(가상 일정)의 계획과 기록.', body: '여행마다 계획 · 일정 · 사진 메모 · 돌아보기를 남깁니다.' },
  { id: 'guide-garden', kind: 'guide', title: '베란다 텃밭 안내', path: 'project-balcony-garden.md', parent: 'personal-life', updated: '2026-10-22',
    summary: '베란다 화분 텃밭 가꾸기의 관찰 기록 안내.', body: '관찰 기록을 날짜 순서로 읽습니다. 물 주기 규칙은 첫 기록에 있습니다.' },

  // ── 연구 ──
  { id: 'research-papers', kind: 'subindex', title: '연구 · 논문 메모', path: 'research--papers.md', parent: 'area-research', updated: '2026-11-04',
    summary: '가상 논문을 읽고 남긴 메모. 분야별로 같은 틀을 씁니다.', body: '질문 · 방법 · 결과 · 의심할 점 네 칸으로 정리합니다.' },
  { id: 'guide-reading-group', kind: 'guide', title: '논문 읽기 모임 안내', path: 'project-reading-group.md', parent: 'research-papers', updated: '2026-11-03',
    summary: '격주 수요일 논문 읽기 모임(가상)의 회차별 기록 안내.', body: '회차 기록에 발표한 논문 메모를 연결합니다.' },
  { id: 'research-experiments', kind: 'subindex', title: '연구 · 실험 기록', path: 'research--experiments.md', parent: 'area-research', updated: '2026-11-02',
    summary: '작게 해 본 실험의 가설 · 방법 · 결과.', body: '실험마다 가설을 먼저 적고, 결과가 가설과 다르면 그대로 남깁니다.' },
  { id: 'guide-survey', kind: 'guide', title: '업무 도구 사용 설문 안내', path: 'project-survey.md', parent: 'research-experiments', updated: '2026-10-30',
    summary: '팀별 업무 도구 사용 설문(가상 응답)의 설계 · 분석 안내.', body: '설계 → 문항 → 팀별 분석 → 종합 순서로 읽습니다. 응답은 모두 가상입니다.' },
  { id: 'research-datasets', kind: 'subindex', title: '연구 · 데이터셋 카드', path: 'research--datasets.md', parent: 'area-research', updated: '2026-10-28',
    summary: '실험에 쓰는 가상 데이터셋의 출처 · 범위 · 주의점.', body: '데이터셋마다 같은 카드 양식을 씁니다. 개인 식별 정보는 없습니다.' }
];

/** 반복 기록 시리즈. budget = 만들 자료 수. 마지막 일일 기록 보관 시리즈가 남는 수를 채운다 */
export function expandMaterials(budget: number): Seed[] {
  const out: Seed[] = [];
  const add = (s: Omit<Seed, 'kind'>) => out.push({ kind: 'material', ...s });
  const prev = (prefix: string, i: number, title: (i: number) => string, label = '이전 기록') => (i > 0 ? `\n\n${label}: ${ref(`${prefix}-${i - 1}`, title(i - 1))}` : '');

  // ── 노바: 스프린트 · 사용성 시험 ──
  const sprint = (i: number) => `노바 스프린트 ${i + 1} 노트`;
  const sprintGoals = ['홈 첫 화면 시안', '요금 비교표 구현', '도입 사례 필터', '모바일 메뉴', '대비 수정', '문구 교체', '이미지 최적화', '검색 연결', '접근성 재점검', '공개 전 점검', '분석 태그', '오류 화면', '속도 개선', '다국어 준비', '공개 후 수정', '회고 반영'];
  for (let i = 0; i < 16; i++) add({ id: `nova-sprint-${i}`, title: sprint(i), path: `src-work/projects/nova/sprints/sprint-${pad(i + 1)}.md`, parent: 'guide-nova',
    updated: ago(120 - i * 7), summary: `${sprintGoals[i]}을(를) 목표로 한 2주 스프린트 기록(가상).`, topics: opt(when(i % 5 === 4, 'moc-retro')),
    body: `# ${sprint(i)}\n\n- 목표: ${sprintGoals[i]}\n- 끝낸 것: ${at(sprintGoals, i - 1)} 마무리\n- 넘긴 것: ${at(sprintGoals, i + 2)} 일부\n- 기준: ${ref('nova-ia', '노바 정보 구조 초안')}${prev('nova-sprint', i, sprint)}` });
  const ux = (i: number) => `노바 사용성 시험 ${i + 1}회차`;
  const uxTasks = ['요금 찾기', '도입 사례 고르기', '문의 남기기', '메뉴 다시 찾기', '모바일로 비교표 보기', '검색으로 기능 찾기', '처음 방문 30초 설명', '키보드로만 이동', '확대해서 읽기', '공개 직후 첫 인상'];
  for (let i = 0; i < 10; i++) add({ id: `nova-ux-${i}`, title: ux(i), path: `src-work/projects/nova/usability/session-${pad(i + 1)}.md`, parent: 'guide-nova',
    updated: ago(70 - i * 5), summary: `"${uxTasks[i]}" 과제로 가상 참여자 다섯 명을 관찰한 기록.`, topics: ['moc-design', ...when(i % 3 === 0, 'moc-method')],
    body: `# ${ux(i)}\n\n과제: ${uxTasks[i]}\n\n- 막힌 곳: ${at(uxTasks, i + 3)}와(과) 헷갈림\n- 바꿀 것: 버튼 이름을 행동으로 쓴다\n- 점검 기준: ${ref('nova-a11y', '노바 접근성 점검 목록')}${prev('nova-ux', i, ux, '지난 회차')}` });

  // ── 루멘: 위젯 명세 · 주간 보고 ──
  const widgets = ['활성 사용자 추이', '기능 사용률 표', '응답 시간 분포', '신규 가입 흐름', '이탈 구간', '팀별 사용량', '오류율', '지연 알림', '주간 비교', '기간 선택기', '목표 대비', '내보내기', '권한 표시', '빈 상태 안내'];
  widgets.forEach((w, i) => add({ id: `lumen-widget-${i}`, title: `루멘 위젯 명세 · ${w}`, path: `src-work/projects/lumen/widgets/widget-${pad(i + 1)}.md`, parent: 'guide-lumen',
    updated: ago(90 - i * 4), summary: `대시보드의 "${w}" 위젯이 보여 줄 값과 빈 상태(가상).`, topics: opt([...when(i % 3 === 0, 'moc-dev'), ...when(i % 4 === 1, 'moc-design')]),
    body: `# 루멘 위젯 명세 · ${w}\n\n- 값의 정의: ${ref('lumen-metrics', '루멘 핵심 지표 정의')}를 따른다\n- 빈 상태: "아직 모인 기록이 없습니다"\n- 축과 색: ${ref('learn-viz-book', '독서 메모 · 데이터 시각화 입문')}의 기준` }));
  const report = (i: number) => `루멘 주간 보고 W${30 + i}`;
  for (let i = 0; i < 12; i++) add({ id: `lumen-report-${i}`, title: report(i), path: `src-work/projects/lumen/reports/2026-W${30 + i}.md`, parent: 'guide-lumen',
    updated: ago(100 - i * 7), summary: '수집 상태 · 바뀐 위젯 · 다음 주 할 일을 적은 짧은 보고(가상 수치 없음).',
    body: `# ${report(i)}\n\n- 수집: ${i % 4 === 2 ? '하루 지연 → 재계산 완료' : '정상'}\n- 바뀐 위젯: ${ref(`lumen-widget-${i}`, `루멘 위젯 명세 · ${widgets[i]}`)}\n- 점검: ${ref(`lumen-check-${i % 10}`, `지표 점검 ${pad((i % 10) + 1)}`)}${prev('lumen-report', i, report, '지난 보고')}` });

  // ── 오르빗: 화면 명세 · QA · 출시 노트 · 시안 ──
  const screens = ['로그인', '홈 일정', '검색', '알림', '설정', '프로필', '반복 일정', '온보딩 1', '온보딩 2', '빈 화면', '오류 화면', '오프라인 화면', '공유 시트', '홈 위젯', '어두운 테마', '접근성 설정'];
  screens.forEach((s, i) => add({ id: `orbit-screen-${i}`, title: `오르빗 화면 명세 · ${s}`, path: `src-work/projects/orbit/screens/screen-${pad(i + 1)}.md`, parent: 'guide-orbit',
    updated: ago(80 - i * 3), summary: `"${s}" 화면의 목적 · 요소 · 상태(가상 앱).`, topics: opt(when(i % 2 === 0, 'moc-design')),
    body: `# 오르빗 화면 명세 · ${s}\n\n- 목적: 한 손으로 3초 안에 쓸 수 있게\n- 상태: 기본 · 읽는 중 · 빈 상태 · 오류\n- 다음 화면: ${ref(`orbit-screen-${(i + 1) % screens.length}`, `오르빗 화면 명세 · ${at(screens, i + 1)}`)}\n- 접근성 기준: ${ref('nova-a11y', '노바 접근성 점검 목록')}` }));
  const qa = (i: number) => `오르빗 QA 기록 ${pad(i + 1)}`;
  for (let i = 0; i < 14; i++) add({ id: `orbit-qa-${i}`, title: qa(i), path: `src-work/projects/orbit/qa/qa-${pad(i + 1)}.md`, parent: 'guide-orbit',
    updated: ago(60 - i * 3), summary: `${at(screens, i * 3)} 화면 중심의 시험 기록(가상 기기).`, topics: opt(when(i % 3 === 1, 'moc-dev')),
    body: `# ${qa(i)}\n\n- 대상: ${ref(`orbit-screen-${(i * 3) % screens.length}`, `오르빗 화면 명세 · ${at(screens, i * 3)}`)}\n- 결과: ${i % 4 === 0 ? '재현되는 문제 1건 → 다음 출시에서 수정' : '통과'}\n- 기록 양식: ${ref('ops-incident', '장애 대응 기록 양식')}${prev('orbit-qa', i, qa)}` });
  const release = (i: number) => `오르빗 출시 노트 0.${i + 1}`;
  for (let i = 0; i < 14; i++) add({ id: `orbit-release-${i}`, title: release(i), path: `src-work/projects/orbit/releases/v0-${i + 1}.md`, parent: 'guide-orbit',
    updated: ago(56 - i * 3), summary: `${at(screens, i + 2)} 개선과 고친 문제를 적은 출시 노트(가상).`, listedBy: opt(when(i % 4 === 3, 'work-newsletter')),
    body: `# ${release(i)}\n\n- 새로움: ${at(screens, i + 2)} 화면 개선\n- 고침: ${ref(`orbit-qa-${i}`, qa(i))}에서 찾은 문제\n- 문장 기준: ${ref('content-style', '글쓰기 스타일 가이드')}${prev('orbit-release', i, release, '이전 출시')}` });
  ['홈', '검색', '알림', '설정'].forEach((s, i) => add({ id: `orbit-mock-${i}`, title: `오르빗 시안 · ${s}.png`, path: `src-work/projects/orbit/mockups/오르빗 시안 ${s}.png`, parent: 'guide-orbit',
    updated: ago(85 - i * 2), format: 'image', topics: ['moc-design'], summary: `${s} 화면 시안 이미지. 데모에는 이미지 파일이 없고 설명만 있습니다.` }));

  // ── 아틀라스: 검색어 분석 · 관련도 실험 · 동의어 ──
  const queries = ['휴가 신청', '보안 교육', '경비 처리', '회의실 예약', '장비 요청', '사내 규정', '출장 신청', '복지 제도', '재택 근무', '교육 신청', '계정 잠금', '프린터 설정', '주차 등록', '문서 양식', '조직도', '입사 서류'];
  queries.forEach((q, i) => add({ id: `atlas-query-${i}`, title: `검색어 분석 · ${q}`, path: `src-work/projects/atlas/queries/q-${pad(i + 1)}.md`, parent: 'guide-atlas',
    updated: ago(75 - i * 3), summary: `"${q}"를 찾는 사람이 실제로 원한 문서와 놓친 이유(가상 기록).`, topics: opt([...when(i % 4 === 0, 'moc-dev'), ...when(i % 4 === 2, 'moc-method')]),
    body: `# 검색어 분석 · ${q}\n\n- 원한 문서: ${q} 절차 안내\n- 놓친 이유: ${i % 3 === 0 ? '제목에 다른 이름을 씀' : i % 3 === 1 ? '오래된 문서가 위에 옴' : '띄어쓰기 차이'}\n- 비슷한 검색어: ${at(queries, i + 5)}` }));
  const methods = ['제목 가중치', '최근성 가산', '동의어 확장', '오타 교정', '부서 필터', '클릭 반영', '문서 길이 보정', '구문 일치', '태그 가중치', '중복 제거', '요약 색인', '혼합 순위'];
  methods.forEach((m, i) => add({ id: `atlas-exp-${i}`, title: `관련도 실험 ${pad(i + 1)} · ${m}`, path: `src-work/projects/atlas/experiments/exp-${pad(i + 1)}.md`, parent: 'guide-atlas',
    updated: ago(50 - i * 3), summary: `${m}이(가) 상위 결과를 바꾸는지 본 작은 실험(가상).`, topics: opt([...when(i % 2 === 0, 'moc-method'), ...when(i % 3 === 1, 'moc-dev')]),
    body: `# 관련도 실험 ${pad(i + 1)} · ${m}\n\n- 가설: ${m}을(를) 넣으면 원한 문서가 위로 온다\n- 대상 검색어: ${ref(`atlas-query-${i}`, `검색어 분석 · ${queries[i]}`)}\n- 결과: ${i % 3 === 2 ? '차이 없음 → 되돌림' : '일부 개선 → 다음 실험과 묶음'}${i > 0 ? `\n\n앞 실험: ${ref(`atlas-exp-${i - 1}`, `관련도 실험 ${pad(i)} · ${methods[i - 1]}`)}` : ''}` }));
  const synonyms = ['휴가 · 연차 · 휴무', '경비 · 비용 · 정산', '회의실 · 미팅룸', '장비 · 기자재', '교육 · 연수 · 강의', '재택 · 원격 근무', '계정 · 아이디', '양식 · 서식 · 템플릿', '출장 · 외근', '복지 · 혜택'];
  synonyms.forEach((s, i) => add({ id: `atlas-syn-${i}`, title: `동의어 사전 · ${s}`, path: `src-work/projects/atlas/synonyms/syn-${pad(i + 1)}.md`, parent: 'guide-atlas',
    updated: ago(40 - i * 2), summary: `"${s}"를 같은 뜻으로 묶은 규칙과 예외.`,
    body: `# 동의어 사전 · ${s}\n\n- 묶음: ${s}\n- 예외: 고유한 제도 이름은 묶지 않는다\n- 근거 실험: ${ref('atlas-exp-2', '관련도 실험 03 · 동의어 확장')}` }));

  // ── 하버: 문의 분류 · 답변 초안 · 대화 시험 ──
  const cats = ['계정', '결제', '배송', '환불', '요금제', '앱 사용', '알림', '데이터', '개인정보', '오류 신고', '단체 이용', '기타'];
  cats.forEach((c, i) => add({ id: `harbor-cat-${i}`, title: `문의 분류 · ${c}`, path: `src-work/projects/harbor/categories/cat-${pad(i + 1)}.md`, parent: 'guide-harbor',
    updated: ago(66 - i * 2), summary: `"${c}" 문의를 알아보는 표현과 사람에게 넘길 기준.`,
    body: `# 문의 분류 · ${c}\n\n- 알아보는 표현: "${c}" 관련 질문 · 불만 · 요청\n- 사람에게 넘김: 화가 난 표현 · 금전 문제 · 개인정보\n- 다음 분류: ${ref(`harbor-cat-${(i + 1) % cats.length}`, `문의 분류 · ${at(cats, i + 1)}`)}` }));
  const asks = ['비밀번호 재설정', '환불 기간', '배송 조회', '영수증 발급', '요금제 변경', '계정 삭제', '결제 실패', '쿠폰 적용', '주소 변경', '해지 방법', '상담 시간', '첨부 용량', '알림 끄기', '공동 사용', '데이터 내보내기', '로그인 오류', '앱 설치', '언어 설정', '개인정보 열람', '오류 신고 방법', '단체 구매', '교육 자료'];
  asks.forEach((a, i) => add({ id: `harbor-answer-${i}`, title: `답변 초안 · ${a}`, path: `src-work/projects/harbor/answers/answer-${pad(i + 1)}.md`, parent: 'guide-harbor',
    updated: ago(45 - i), summary: `"${a}" 문의에 보낼 자동 답변 초안(가상 서비스).`, topics: opt([...when(i % 5 === 0, 'moc-ai'), ...when(i % 5 === 3, 'moc-writing')]),
    body: `# 답변 초안 · ${a}\n\n1. 무엇을 도와드릴지 한 문장으로 확인한다\n2. 해결 순서를 세 단계 이하로 안내한다\n3. 해결되지 않으면 상담원 연결을 안내한다\n\n분류: ${ref(`harbor-cat-${i % cats.length}`, `문의 분류 · ${at(cats, i)}`)}\n문장 기준: ${ref('content-style', '글쓰기 스타일 가이드')}${i % 5 === 0 ? `\n지시문: ${ref('learn-prompt-patterns', '프롬프트 작성 패턴')}` : ''}` }));
  const bot = (i: number) => `대화 시나리오 시험 ${pad(i + 1)}`;
  for (let i = 0; i < 10; i++) add({ id: `harbor-test-${i}`, title: bot(i), path: `src-work/projects/harbor/tests/test-${pad(i + 1)}.md`, parent: 'guide-harbor',
    updated: ago(30 - i * 2), summary: `${at(asks, i * 2)} 문의를 가상 대화로 시험한 기록.`, topics: ['moc-ai', ...when(i % 4 === 2, 'moc-method')],
    body: `# ${bot(i)}\n\n- 시나리오: ${at(asks, i * 2)}\n- 사용 답변: ${ref(`harbor-answer-${(i * 2) % asks.length}`, `답변 초안 · ${at(asks, i * 2)}`)}\n- 결과: ${i % 3 === 0 ? '사람에게 넘김이 늦음 → 기준 수정' : '통과'}${prev('harbor-test', i, bot, '이전 시험')}` });

  // ── 운영: 회의록 보관 · 장애 기록 · 운영 규칙 ──
  const meet = (i: number) => (i < 52 ? `팀 주간 회의 2025-W${pad(i + 1)}` : `팀 주간 회의 2026-W${pad(i - 51)}`);
  const agendas = ['일정 점검', '막힌 일 공유', '다음 주 우선순위', '배포 전 확인', '회고 항목 정리', '외부 요청 분류', '채용 진행', '예산 점검', '고객 요청 정리'];
  for (let i = 0; i < 40; i++) add({ id: `ops-archive-${i}`, title: meet(i), path: `src-work/operations/meetings/${i < 52 ? `2025-W${pad(i + 1)}` : `2026-W${pad(i - 51)}`}.md`, parent: 'work-ops-meetings',
    updated: ago(670 - i * 7), summary: `${at(agendas, i)} 중심의 지난 주간 회의 기록(가상).`,
    body: `# ${meet(i)}\n\n- 안건: ${at(agendas, i)} · ${at(agendas, i + 3)}\n- 결정: 담당자와 기한을 회의 안에서 정한다${i % 6 === 0 ? `\n- 정리: ${ref('ops-meeting-prompt', '회의록 요약 프롬프트')}로 요약` : ''}${prev('ops-archive', i, meet, '이전 회의')}` });
  const causes = ['인증서 만료', '설정 누락', '디스크 가득 참', '배포 순서 오류', '외부 서비스 지연', '캐시 초기화 실패', '권한 변경', '시간대 계산', '대량 요청', '백업 실패', '알림 누락', '의존 서비스 변경'];
  const inc = (i: number) => `장애 기록 2026-${pad(i + 1, 3)}`;
  for (let i = 0; i < 24; i++) add({ id: `ops-inc-${i}`, title: `${inc(i)} · ${at(causes, i)}`, path: `src-work/operations/incidents/inc-2026-${pad(i + 1, 3)}.md`, parent: 'work-ops-incidents',
    updated: ago(300 - i * 12), summary: `${at(causes, i)}(으)로 생긴 가상 장애의 영향 · 원인 · 재발 방지.`, topics: opt([...when(i % 3 === 0, 'moc-dev'), ...when(i % 4 === 1, 'moc-retro')]),
    body: `# ${inc(i)} · ${at(causes, i)}\n\n- 영향: 일부 화면이 ${i % 2 ? '느려짐' : '열리지 않음'}(가상)\n- 원인: ${at(causes, i)}\n- 재발 방지: 점검 목록에 한 줄 추가\n- 양식: ${ref('ops-incident', '장애 대응 기록 양식')}${i % 5 === 2 ? `\n- 관련 QA: ${ref(`orbit-qa-${i % 14}`, qa(i % 14))}` : ''}` });
  const rules = ['공유 폴더 이름 규칙', '외부 공유 승인', '휴가 인수인계', '비밀번호 관리 원칙', '회의 시간 원칙', '문서 보관 기간', '배포 시간대', '고객 응대 기준', '비용 승인 단계', '도구 도입 절차'];
  rules.forEach((r, i) => add({ id: `ops-rule-${i}`, title: `운영 규칙 · ${r}`, path: `src-work/operations/rules/rule-${pad(i + 1)}.md`, parent: 'work-ops',
    updated: ago(200 - i * 9), summary: `"${r}"에 관한 팀 합의(예시).`, topics: opt([...when(i % 4 === 0, 'moc-planning'), ...when(i === 2 || i === 4, 'moc-health')]),
    body: `# 운영 규칙 · ${r}\n\n- 원칙: 짧고 지킬 수 있게\n- 예외: 담당자와 상의\n- 새 사람에게: ${ref('ops-onboarding', '신규 입사자 온보딩 안내')}에서 안내` }));

  // ── 고객사(가상 회사) ──
  const clients = [['harang', '하랑물류'], ['saesol', '새솔출판'], ['ollim', '올림교육'], ['danbi', '단비가구'], ['bada', '바다식품']];
  const steps = [['kickoff', '첫 미팅 메모'], ['needs', '요구사항 정리'], ['proposal', '제안서 초안'], ['scope', '계약 범위 메모'], ['midterm', '중간 보고'], ['retro', '회고']];
  clients.forEach(([slug, name], c) => steps.forEach(([step, label], s) => add({ id: `client-${c}-${s}`, title: `${name} · ${label}`, path: `src-work/clients/${slug}/${step}.md`, parent: 'work-clients',
    updated: ago(260 - c * 40 - s * 6), summary: `${name}(가상 회사)와 진행한 일의 ${label}.`, topics: opt([...when(s === 2 && c % 2 === 0, 'moc-planning'), ...when(s === 5, 'moc-retro')]),
    body: `# ${name} · ${label}\n\n모든 회사 · 인물은 데모용 가상입니다.\n\n- 핵심: ${at(['일정', '범위', '예산 기준', '담당자', '보고 주기', '다음 협업'], s)} 확인\n${s > 0 ? `- 이전 단계: ${ref(`client-${c}-${s - 1}`, `${name} · ${steps[s - 1][1]}`)}` : `- 시작 점검: ${ref('projects-checklist', '프로젝트 시작 체크리스트')}`}` })));

  // ── 콘텐츠: 뉴스레터 · 영상 · 소셜 ──
  const issue = (i: number) => { const m = i + 3; const y = m > 12 ? 2026 : 2025; return { y, m: m > 12 ? m - 12 : m }; };
  const issueTitle = (i: number) => { const { y, m } = issue(i); return `뉴스레터 ${y}년 ${m}월호`; };
  const themes = ['새해 계획 정리', '봄 업데이트', '고객 사례', '접근성 이야기', '여름 휴가 전 정리', '데이터 읽는 법', '팀 소개', '가을 업데이트', '도구 정리', '연말 돌아보기'];
  for (let i = 0; i < 20; i++) { const { y, m } = issue(i); add({ id: `content-issue-${i}`, title: issueTitle(i), path: `src-work/content/newsletter/${y}-${pad(m)}.md`, parent: 'work-newsletter',
    updated: `${y}-${pad(m)}-${pad(3 + (i % 5))}`, summary: `"${at(themes, i)}"을(를) 주제로 보낸 뉴스레터(가상).`, topics: opt(when(i % 4 === 1, 'moc-writing')),
    body: `# ${issueTitle(i)}\n\n주제: ${at(themes, i)}\n\n- 첫 문단: 이번 달 한 줄 요약\n- 소식 세 가지\n- 문장 기준: ${ref('content-style', '글쓰기 스타일 가이드')}${prev('content-issue', i, issueTitle, '지난 호')}` }); }
  const videos = ['지표 대시보드 둘러보기', '회의록 3분 정리', '검색 잘하는 법', '모바일 앱 첫 화면', '접근성 점검 따라 하기', '데이터 표 읽기', '팀 회고 방식', '문의 응대 자동화', '뉴스레터 만드는 과정', '문서 이름 짓기', '출시 노트 쓰기', '한 해 돌아보기'];
  videos.forEach((v, i) => add({ id: `content-video-${i}`, title: `영상 대본 · ${v}`, path: `src-work/content/video/ep-${pad(i + 1)}.md`, parent: 'work-video',
    updated: ago(150 - i * 9), summary: `"${v}" 영상의 장면별 대본(가상).`, topics: opt([...when(i % 3 === 0, 'moc-writing'), ...when(i % 4 === 3, 'moc-design')]),
    body: `# 영상 대본 · ${v}\n\n1. 여는 장면: 문제 한 문장\n2. 시연 장면: 화면 세 번 바꾸기\n3. 닫는 장면: 해 볼 일 하나\n\n일정: ${ref('content-calendar', '콘텐츠 발행 일정')}` }));
  const posts = ['짧은 팁 · 링크 거는 법', '짧은 팁 · 회의 줄이기', '짧은 팁 · 검색어 고르기', '짧은 팁 · 문서 이름', '행사 안내', '채용 안내', '출시 소식', '고객 이야기', '팀 일상', '책 추천', '연말 인사', '새해 인사'];
  posts.forEach((p, i) => add({ id: `content-post-${i}`, title: `소셜 게시물 · ${p}`, path: `src-work/content/social/post-${pad(i + 1)}.md`, parent: 'work-video',
    updated: ago(120 - i * 8), summary: `"${p}" 게시물 문구와 이미지 설명(가상).`,
    body: `# 소셜 게시물 · ${p}\n\n- 문구: 두 문장 이하\n- 이미지: 설명 문구 함께 달기\n${i % 3 === 0 ? `- 원본 영상: ${ref(`content-video-${i % videos.length}`, `영상 대본 · ${at(videos, i)}`)}` : '- 해시태그: 세 개 이하'}` }));

  // ── 개인 · 학습: 독서 · 강의 · 스터디 · 일본어 ──
  const A = ['조용한', '오래된', '작은', '느린', '단단한', '가벼운', '깊은', '다정한'];
  const N = ['습관', '질문', '지도', '도시', '숲', '편지', '시간', '기록'];
  const book = (i: number) => `${A[i % 8]} ${N[(i % 8 + Math.floor(i / 8)) % 8]}`;
  for (let i = 0; i < 40; i++) add({ id: `reading-${i}`, title: `독서 메모 · ${book(i)}`, path: `src-personal/learning/reading/library/book-${pad(i + 1, 3)}.md`, parent: 'personal-reading',
    updated: ago(400 - i * 9), summary: `가상 도서 "${book(i)}"을(를) 읽고 남긴 메모.`, topics: opt([...when(i % 6 === 0, 'moc-writing'), ...when(i % 6 === 3, 'moc-planning'), ...when(i % 9 === 4, 'moc-health')]),
    body: `# 독서 메모 · ${book(i)}\n\n- 기억할 문장 하나\n- 바로 해 볼 것: ${at(['아침 10분 쓰기', '질문 목록 만들기', '산책하며 생각하기', '한 줄 요약', '할 일 줄이기'], i)}\n- 더 찾아볼 질문 하나${i % 5 === 0 ? `\n\n비슷한 메모: ${ref(`learn-book-${(i / 5) % 12}`, `독서 메모 · ${at(['느리게 배우는 법', '작은 습관의 힘(가상)', '질문하는 기술', '설계의 언어', '데이터와 이야기', '오래 쓰는 글', '기록의 쓸모', '함께 일하는 법', '숫자 읽기', '좋은 결정', '단순하게 만들기', '배움의 지도'], i / 5)}`)}` : ''}` });
  const courses = [['data', '데이터 분석 입문'], ['ux', 'UX 리서치 기초'], ['python', '파이썬 자동화'], ['stats', '통계 다시 보기']];
  const lessons = ['오리엔테이션', '기본 개념', '도구 익히기', '첫 실습', '사례 읽기', '흔한 실수', '작은 과제', '정리와 다음 단계'];
  courses.forEach(([slug, name], c) => lessons.forEach((l, k) => add({ id: `course-${c}-${k}`, title: `${name} ${k + 1}강 · ${l}`, path: `src-personal/learning/courses/${slug}/lecture-${pad(k + 1)}.md`, parent: 'personal-courses',
    updated: ago(220 - c * 30 - k * 3), summary: `온라인 강의 "${name}"(가상) ${k + 1}강 노트.`, topics: opt([...when(c === 1 && k % 2 === 0, 'moc-design', 'moc-method'), ...when(c === 3 && k % 3 === 1, 'moc-method'), ...when(c === 2 && k === 6, 'moc-dev')]),
    body: `# ${name} ${k + 1}강 · ${l}\n\n- 한 줄 요약\n- 따라 한 것\n- 헷갈린 것${k > 0 ? `\n\n이전 강의: ${ref(`course-${c}-${k - 1}`, `${name} ${k}강 · ${lessons[k - 1]}`)}` : ''}${c === 2 && k === 0 ? `\n참고: ${ref('learn-typescript', '타입스크립트 학습 노트')}` : ''}` })));
  const mlTopics = ['합성곱 신경망', '순환 신경망', '임베딩', '주의 메커니즘', '전이 학습', '과적합 다루기', '하이퍼파라미터', '모델 해석', '추천 기초', '시계열 예측', '강화 학습 맛보기', '스터디 마무리'];
  mlTopics.forEach((t, i) => add({ id: `ml-week-late-${i}`, title: `${i + 9}주차 · ${t}`, path: `src-personal/learning/ml-study/week-${i + 9}.md`, parent: 'guide-study-ml',
    updated: ago(Math.max(0, 30 - i * 2)), summary: `${t}을(를) 정리한 스터디 노트(가상).`, topics: ['moc-ai', ...when(i % 4 === 3, 'moc-method')],
    body: `# ${i + 9}주차 · ${t}\n\n- 핵심 개념 정리\n- 연습 문제 풀이\n\n지난 주: ${i === 0 ? ref('ml-week-extra-5', '8주차 · 평가 다시 보기') : ref(`ml-week-late-${i - 1}`, `${i + 8}주차 · ${mlTopics[i - 1]}`)}` }));
  const jp = ['인사', '숫자', '시간', '가족', '음식 주문', '길 묻기', '쇼핑', '날씨', '취미', '일과', '교통', '병원', '전화', '약속 잡기', '여행', '감정 표현', '부탁하기', '사과하기', '회사 생활', '계절 행사', '경어 기초', '편지 쓰기', '뉴스 듣기', '복습'];
  jp.forEach((t, i) => add({ id: `jp-lesson-${i}`, title: `일본어 ${i + 1}과 · ${t}`, path: `src-personal/learning/japanese/lesson-${pad(i + 1)}.md`, parent: 'guide-japanese',
    updated: ago(180 - i * 6), summary: `"${t}" 표현과 예문 노트(가상 교재).`, topics: opt(when(t === '여행', 'moc-planning')),
    body: `# 일본어 ${i + 1}과 · ${t}\n\n- 표현 다섯 개\n- 예문 세 개 소리 내어 읽기\n${i > 0 ? `\n이전 과: ${ref(`jp-lesson-${i - 1}`, `일본어 ${i}과 · ${jp[i - 1]}`)}` : ''}${t === '여행' ? `\n여행 준비: ${ref('life-trip', '제주 여행 계획')}` : ''}` }));
  for (let i = 0; i < 6; i++) add({ id: `jp-vocab-${i}`, title: `일본어 단어장 ${i + 1}`, path: `src-personal/learning/japanese/vocab-${pad(i + 1)}.md`, parent: 'guide-japanese',
    updated: ago(170 - i * 24), summary: `${i * 4 + 1}~${i * 4 + 4}과 단어를 모은 주말 복습용 목록.`,
    body: `# 일본어 단어장 ${i + 1}\n\n${[0, 1, 2, 3].map(k => `- ${ref(`jp-lesson-${i * 4 + k}`, `일본어 ${i * 4 + k + 1}과 · ${jp[i * 4 + k]}`)}`).join('\n')}` });

  // ── 개인 · 기록: 회고 ──
  const wk = (i: number) => `주간 회고 2026-W${pad(10 + i)}`;
  const highs = ['계획대로 끝냄', '운동 세 번', '책 한 권', '일찍 잠', '스터디 발표', '정리 정돈', '가족과 저녁', '새 요리'];
  for (let i = 0; i < 26; i++) add({ id: `review-week-${i}`, title: wk(i), path: `src-personal/journal/reviews/2026-W${pad(10 + i)}.md`, parent: 'personal-reviews',
    updated: ago(240 - i * 7), summary: `잘한 일 · 미룬 일 · 다음 주 약속을 적은 개인 회고(가상).`, topics: opt(when(i % 3 === 0, 'moc-retro')),
    body: `# ${wk(i)}\n\n- 잘한 일: ${at(highs, i)}\n- 미룬 일: ${at(highs, i + 3)}\n- 다음 주 약속 하나\n\n양식: ${ref('journal-weekly-review', '주간 회고')}${prev('review-week', i, wk, '지난주')}` });
  const month = (i: number) => { const m = i + 10; return m > 12 ? `2026년 ${m - 12}월 돌아보기` : `2025년 ${m}월 돌아보기`; };
  for (let i = 0; i < 12; i++) { const m = i + 10; const y = m > 12 ? 2026 : 2025; const mm = m > 12 ? m - 12 : m;
    add({ id: `review-month-${i}`, title: month(i), path: `src-personal/journal/reviews/${y}-${pad(mm)}.md`, parent: 'personal-reviews',
      updated: `${mm === 12 ? y + 1 : y}-${pad(mm === 12 ? 1 : mm + 1)}-01`, summary: '한 달 동안의 습관 · 공부 · 생활을 돌아본 기록.', topics: ['moc-retro', ...when(i % 3 === 1, 'moc-writing')],
      body: `# ${month(i)}\n\n- 지킨 습관 하나, 놓친 습관 하나\n- 가장 오래 남은 장면\n- 다음 달에 바꿀 것${i > 0 ? `\n\n지난달: ${ref(`review-month-${i - 1}`, month(i - 1))}` : ''}${i === 11 ? `\n다음: ${ref('journal-october', '10월 돌아보기')}` : ''}` }); }

  // ── 개인 · 생활: 건강 · 달리기 · 가계 · 요리 · 여행 · 텃밭 ──
  const wo = (i: number) => `운동 기록 2026-${pad(i + 1, 3)}`;
  for (let i = 0; i < 30; i++) add({ id: `health-workout-${i}`, title: wo(i), path: `src-personal/life/health/workout/2026-${pad(i + 1, 3)}.md`, parent: 'personal-health',
    updated: ago(250 - i * 6), summary: '그날 한 운동 · 시간 · 컨디션(가상).', topics: opt(when(i % 5 === 0, 'moc-health')),
    body: `# ${wo(i)}\n\n- ${at(['근력 40분', '걷기 1시간', '수영 30분', '자전거 45분', '스트레칭 20분'], i)}\n- 컨디션: ${at(['좋음', '보통', '피곤함', '가벼움'], i)}\n\n계획: ${ref('life-workout', '운동 루틴')}` });
  const sleep = (i: number) => `수면 메모 ${i + 1}주`;
  for (let i = 0; i < 10; i++) add({ id: `health-sleep-${i}`, title: sleep(i), path: `src-personal/life/health/sleep/week-${pad(i + 1)}.md`, parent: 'personal-health',
    updated: ago(140 - i * 7), summary: '잠든 시각 · 깬 횟수 · 낮 컨디션을 적은 주간 메모(가상).', topics: ['moc-health'],
    body: `# ${sleep(i)}\n\n- 잠든 시각: ${at(['11시 전', '자정 무렵', '11시 반'], i)}\n- 화면 끄기: 잠들기 30분 전\n- 낮 컨디션: ${at(['좋음', '보통', '오후에 졸림'], i)}${prev('health-sleep', i, sleep, '지난주')}` });
  const run = (i: number) => `하프 마라톤 훈련 ${Math.floor(i / 3) + 1}주차 ${(i % 3) + 1}회`;
  for (let i = 0; i < 18; i++) add({ id: `running-${i}`, title: run(i), path: `src-personal/life/running/week-${pad(Math.floor(i / 3) + 1)}-${(i % 3) + 1}.md`, parent: 'guide-running',
    updated: ago(90 - i * 4), summary: `${at(['천천히 오래', '구간 반복', '언덕'], i)} 훈련 기록(가상).`, topics: opt(when(i % 3 === 0, 'moc-health')),
    body: `# ${run(i)}\n\n- 훈련: ${at(['천천히 오래 달리기', '빠르게 1분 · 천천히 2분 반복', '언덕 오르기'], i)}\n- 몸 상태: ${at(['가벼움', '종아리 뻐근함', '보통'], i)}${prev('running', i, run, '이전 훈련')}${i % 6 === 5 ? `\n\n쉬는 날 운동: ${ref('life-workout', '운동 루틴')}` : ''}` });
  const fin = (i: number) => { const m = i + 11; const y = m > 12 ? (m > 24 ? 2026 : 2025) : 2024; const mm = ((m - 1) % 12) + 1; return { y, mm }; };
  const finTitle = (i: number) => { const { y, mm } = fin(i); return `${y}년 ${mm}월 가계 점검`; };
  for (let i = 0; i < 24; i++) { const { y, mm } = fin(i); add({ id: `finance-${i}`, title: finTitle(i), path: `src-personal/life/finance/${y}-${pad(mm)}.md`, parent: 'personal-finance',
    updated: `${y}-${pad(mm)}-28`, summary: '예산표 기준으로 한 달 지출을 점검한 기록(금액 없음, 예시).', topics: opt(when(i % 6 === 5, 'moc-planning')),
    body: `# ${finTitle(i)}\n\n- 고정비: 예산 안\n- 변동비: ${at(['식비가 조금 넘음', '예산 안', '여가비가 넘음', '교통비가 줄어듦'], i)}\n- 비상금: 규칙대로 옮김\n\n기준: ${ref('life-budget', '생활비 예산표')}${prev('finance', i, finTitle, '지난달')}` }); }
  const dishes = ['미역국', '닭가슴살 샐러드', '두부조림', '잡채', '카레', '김밥', '감자전', '콩나물국', '버섯볶음', '오믈렛', '파스타', '어묵볶음', '계란말이', '비빔국수', '시금치나물', '닭볶음탕', '떡국', '연어덮밥', '호박죽', '샌드위치', '수제비', '볶음우동', '나물비빔밥', '된장국'];
  dishes.forEach((d, i) => add({ id: `kitchen-${i}`, title: `요리 기록 · ${d}`, path: `src-personal/life/kitchen/dish-${pad(i + 1)}.md`, parent: 'personal-kitchen',
    updated: ago(200 - i * 8), summary: `${d}을(를) 처음 해 보고 남긴 요령.`, topics: opt(when(i % 4 === 1, 'moc-health')),
    body: `# 요리 기록 · ${d}\n\n- 재료는 미리 손질해 둔다\n- 간은 마지막에 한 번만\n- 다음엔: ${at(['불을 줄인다', '양을 반으로', '채소를 더 넣는다'], i)}${i % 6 === 0 ? `\n\n자주 만드는 요리: ${ref('life-recipes', '자주 만드는 요리')}` : ''}` }));
  const trips = [['gangneung', '강릉'], ['jeonju', '전주'], ['busan', '부산'], ['gyeongju', '경주']];
  const tripDocs = [['plan', '계획'], ['day-1', '첫째 날'], ['day-2', '둘째 날'], ['photos', '사진 메모'], ['review', '돌아보기']];
  trips.forEach(([slug, name], t) => tripDocs.forEach(([doc, label], d) => add({ id: `trip-${t}-${d}`, title: `${name} 여행 · ${label}`, path: `src-personal/life/travel/${slug}/${doc}.md`, parent: 'personal-travel',
    updated: ago(330 - t * 70 - d), summary: `${name} 여행(가상 일정)의 ${label}.`, topics: opt([...when(d === 0, 'moc-planning'), ...when(d === 4 && t % 2 === 0, 'moc-retro')]),
    body: `# ${name} 여행 · ${label}\n\n- ${d === 0 ? '일정: 1박 2일' : d === 4 ? '다시 간다면: 하루 더' : '걸은 곳 · 먹은 것 · 쉰 곳'}\n${d > 0 ? `- 앞 기록: ${ref(`trip-${t}-${d - 1}`, `${name} 여행 · ${tripDocs[d - 1][1]}`)}` : `- 참고: ${ref('life-trip', '제주 여행 계획')}`}` })));
  const plants = ['방울토마토', '상추', '바질', '고추', '대파', '깻잎'];
  const garden = (i: number) => `텃밭 관찰 ${pad(i + 1)} · ${at(plants, i)}`;
  for (let i = 0; i < 18; i++) add({ id: `garden-${i}`, title: garden(i), path: `src-personal/life/garden/note-${pad(i + 1)}.md`, parent: 'guide-garden',
    updated: ago(190 - i * 9), summary: `${at(plants, i)} 화분의 물 · 햇빛 · 자란 모습 기록.`,
    body: `# ${garden(i)}\n\n- 물: ${i % 2 ? '이틀에 한 번' : '흙이 마르면'}\n- 햇빛: 오전 반나절\n- 변화: ${at(['새 잎', '꽃이 핌', '첫 열매', '잎이 노래짐'], i)}${prev('garden', i, garden, '지난 관찰')}` });

  // ── 연구: 논문 · 모임 · 실험 · 설문 · 데이터셋 ──
  const fields = ['검색 순위', '추천 시스템', '문서 요약', '질의 응답', '지식 그래프', '사용자 행동', '시각화 평가', '대화형 에이전트'];
  const designs = ['비교 연구', '사례 분석', '대규모 실험', '설문 조사', '재현 연구', '모형 제안'];
  const paper = (i: number) => `${fields[i % 8]} ${designs[Math.floor(i / 8)]}`;
  for (let i = 0; i < 48; i++) add({ id: `paper-${i}`, title: `논문 메모 · ${paper(i)}`, path: `src-research/papers/paper-${pad(i + 1, 3)}.md`, parent: 'research-papers',
    updated: ago(300 - i * 6), summary: `가상 논문 "${paper(i)}"의 질문 · 방법 · 결과 · 의심할 점.`,
    topics: opt([...when(i % 4 === 0, 'moc-method'), ...when(/질의|대화|요약/.test(fields[i % 8]) && i % 3 !== 2, 'moc-ai'), ...when(fields[i % 8] === '시각화 평가' && i % 2 === 0, 'moc-design')]),
    listedBy: opt(when(i % 12 === 7, 'personal-reading')),
    body: `# 논문 메모 · ${paper(i)} (가상)\n\n- 질문: ${fields[i % 8]}에서 무엇이 결과를 바꾸는가\n- 방법: ${designs[Math.floor(i / 8)]}\n- 결과: 조건에 따라 다름\n- 의심할 점: 표본이 작다${i >= 8 ? `\n\n같은 분야: ${ref(`paper-${i - 8}`, `논문 메모 · ${paper(i - 8)}`)}` : ''}${fields[i % 8] === '검색 순위' && i >= 16 ? `\n업무 적용: ${ref(`atlas-exp-${(i / 8) % 12}`, `관련도 실험 ${pad(((i / 8) % 12) + 1)} · ${methods[(i / 8) % 12]}`)}` : ''}` });
  const session = (i: number) => `논문 읽기 모임 ${i + 1}회`;
  for (let i = 0; i < 16; i++) add({ id: `rg-session-${i}`, title: session(i), path: `src-research/reading-group/session-${pad(i + 1)}.md`, parent: 'guide-reading-group',
    updated: ago(220 - i * 14), summary: `${fields[i % 8]} 논문 두 편을 함께 읽은 회차 기록(가상).`, topics: opt(when(i % 5 === 4, 'moc-retro')),
    body: `# ${session(i)}\n\n- 발표: ${ref(`paper-${(i * 3) % 48}`, `논문 메모 · ${paper((i * 3) % 48)}`)}\n- 토론: ${ref(`paper-${(i * 3 + 8) % 48}`, `논문 메모 · ${paper((i * 3 + 8) % 48)}`)}\n- 다음 회차 질문 하나${prev('rg-session', i, session, '지난 회차')}` });
  const hyps = ['짧은 제목이 더 잘 읽힌다', '요약을 먼저 보이면 더 오래 읽는다', '색 대신 밝기로 순서를 보인다', '알림을 묶으면 덜 끈다', '예시가 있으면 지시문이 짧아진다', '검색어 추천이 재검색을 줄인다', '빈 상태 문구가 이탈을 줄인다', '단계 표시가 완료를 늘린다', '글꼴 크기가 읽기 속도를 바꾼다', '정렬 기준을 보이면 신뢰가 오른다', '느린 화면에 진행 표시가 필요하다', '두 단계 확인이 실수를 줄인다'];
  const exp = (i: number) => `실험 기록 ${pad(i + 1)} · ${at(hyps, i)}`;
  for (let i = 0; i < 24; i++) add({ id: `experiment-${i}`, title: exp(i), path: `src-research/experiments/exp-${pad(i + 1, 3)}.md`, parent: 'research-experiments',
    updated: ago(260 - i * 9), summary: `"${at(hyps, i)}" 가설을 가상 참여자로 시험한 기록.`, topics: opt([...when(i % 2 === 0, 'moc-method'), ...when(i % 6 === 1, 'moc-design'), ...when(i % 8 === 4, 'moc-ai'), ...when(i % 12 === 3, 'moc-health')]),
    body: `# ${exp(i)}\n\n- 가설: ${at(hyps, i)}\n- 방법: 두 안을 번갈아 보여 준다\n- 결과: ${i % 3 === 0 ? '가설과 다름 — 그대로 기록' : '가설과 비슷 — 표본을 늘려 다시'}\n- 데이터: ${ref(`dataset-${i % 16}`, `데이터셋 카드 · ${at(['문서 제목 표본', '검색 기록 요약', '화면 체류 표본', '설문 응답 표본', '알림 반응 표본', '문의 문장 표본', '읽기 속도 표본', '클릭 순서 표본'], i % 16)}${i % 16 >= 8 ? ' 2' : ''}`)}${i >= 12 ? `\n\n앞 실험: ${ref(`experiment-${i - 12}`, exp(i - 12))}` : ''}` });
  const surveyFixed = [['design', '설문 설계'], ['items-1', '문항 초안 1차'], ['items-2', '문항 초안 2차'], ['pilot', '예비 조사 메모'], ['summary', '종합 분석']];
  const teams = ['기획', '디자인', '개발', '운영', '영업', '고객 지원', '콘텐츠', '인사', '재무', '연구', '데이터'];
  surveyFixed.forEach(([slug, label], i) => add({ id: `survey-fixed-${i}`, title: `업무 도구 설문 · ${label}`, path: `src-research/survey/${slug}.md`, parent: 'guide-survey',
    updated: ago(160 - i * 20), summary: `업무 도구 사용 설문(가상 응답)의 ${label}.`, topics: opt(when(i !== 3, 'moc-method')),
    body: `# 업무 도구 설문 · ${label}\n\n- 목적: 팀마다 어떤 도구를 왜 쓰는지 안다\n- 응답은 모두 가상입니다${i > 0 ? `\n\n이전 단계: ${ref(`survey-fixed-${i - 1}`, `업무 도구 설문 · ${surveyFixed[i - 1][1]}`)}` : ''}${i === 4 ? `\n${teams.map((t, k) => `- ${ref(`survey-team-${k}`, `업무 도구 설문 · ${t} 팀 분석`)}`).join('\n')}` : ''}` }));
  teams.forEach((t, k) => add({ id: `survey-team-${k}`, title: `업무 도구 설문 · ${t} 팀 분석`, path: `src-research/survey/teams/team-${pad(k + 1)}.md`, parent: 'guide-survey',
    updated: ago(100 - k * 3), summary: `${t} 팀 응답(가상)에서 본 도구 사용 습관.`, topics: opt(when(k % 4 === 2, 'moc-retro')),
    body: `# 업무 도구 설문 · ${t} 팀 분석\n\n- 많이 쓰는 도구 세 가지\n- 불편: ${at(['검색이 느림', '알림이 많음', '문서가 흩어짐', '권한 요청이 번거로움'], k)}\n- 문항 기준: ${ref('survey-fixed-2', '업무 도구 설문 · 문항 초안 2차')}` }));
  const datasets = ['문서 제목 표본', '검색 기록 요약', '화면 체류 표본', '설문 응답 표본', '알림 반응 표본', '문의 문장 표본', '읽기 속도 표본', '클릭 순서 표본'];
  for (let i = 0; i < 16; i++) { const name = `${datasets[i % 8]}${i >= 8 ? ' 2' : ''}`;
    add({ id: `dataset-${i}`, title: `데이터셋 카드 · ${name}`, path: `src-research/datasets/card-${pad(i + 1)}.md`, parent: 'research-datasets',
      updated: ago(280 - i * 11), summary: `가상 데이터셋 "${name}"의 출처 · 범위 · 주의점.`, topics: opt(when(i % 3 === 0, 'moc-method')),
      body: `# 데이터셋 카드 · ${name}\n\n- 출처: 데모용으로 만든 가상 기록\n- 범위: ${i >= 8 ? '두 번째 수집' : '첫 수집'}\n- 주의: 개인 식별 정보 없음 · 작은 표본${i >= 8 ? `\n\n첫 수집: ${ref(`dataset-${i - 8}`, `데이터셋 카드 · ${datasets[i - 8]}`)}` : ''}` }); }
  ['연구 데이터 관리 규칙.pdf', '설문 동의서 양식.pdf'].forEach((t, i) => add({ id: `research-pdf-${i}`, title: t, path: `src-research/datasets/${t}`, parent: 'research-datasets',
    updated: ago(200 - i * 30), format: 'pdf', summary: `${t.replace('.pdf', '')} PDF. 이 데모는 PDF 본문 보기를 지원하지 않습니다.` }));

  // ── 남는 수: 일일 기록 보관(2026-07-01부터 하루씩) ──
  const left = budget - out.length;
  if (left < 30 || left > 95) throw new Error(`데모 규모 조정 필요: 일일 기록 보관 ${left}건`);
  const start = Date.UTC(2026, 6, 1);
  const dateOf = (i: number) => new Date(start + i * 86400000);
  const dayTitle = (i: number) => { const d = dateOf(i); return `일일 기록 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
  const moods = ['맑음', '조금 피곤', '집중 잘 됨', '바쁨', '차분함', '산만함'];
  for (let i = 0; i < left; i++) { const iso = dateOf(i).toISOString().slice(0, 10);
    add({ id: `daily-archive-${i}`, title: dayTitle(i), path: `src-personal/journal/daily/${iso}.md`, parent: 'personal-daily',
      updated: iso, summary: '기분 · 한 일 · 내일 할 일을 적은 짧은 기록(가상).', topics: opt(when(i % 15 === 7, 'moc-writing')),
      body: `# ${dayTitle(i)}\n\n기분: ${at(moods, i)}\n한 일: ${at(['스터디 정리', '운동', '책 읽기', '텃밭 물 주기', '일본어 한 과'], i)}${i % 7 === 6 ? `\n주간 정리: ${ref(`review-week-${Math.min(25, 16 + Math.floor(i / 7))}`, wk(Math.min(25, 16 + Math.floor(i / 7))))}` : ''}${prev('daily-archive', i, dayTitle)}` }); }
  return out;
}
