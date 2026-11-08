// 합성 데모 데이터 2차 확장: 1,000개 데모(demo.ts + demo-expand.ts)를 그대로 두고 그 둘레에 4,000개를 더해 5,000개로 만든다.
// 실제 자료 · 실제 인물 · 실제 회사 · 실제 도서/논문과 관계없다. 난수 없이 결정적으로 만든다.
//   - 구조로 늘린다: 새 영역(커뮤니티) 하나, 주제 MOC 6개, 하위 색인 · 하위 하위 색인 · 프로젝트 안내를 더하고 자료는 그 아래 시리즈로 둔다.
//     한 색인에 올리는 자료는 90개를 넘지 않는다(안내 문서 100줄 이하). MOC는 영역을 가로지르는 자료만 골라 담는다.
//   - 각 자료는 주 분류 색인 하나(parent)에 오르고, 같은 시리즈의 앞 기록 · 기준 문서 · 다른 영역의 관련 자료와 본문 링크로 잇는다.
//   - 공유 원문(listedBy)은 주 분류보다 깊은 색인에서만 함께 연결한다(링크 너비 우선 분류가 같은 주 분류를 찾게).
import type { DocFormat } from '../core/types';
import type { Seed } from './demo-expand';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
/** 2026-11-05에서 back일 전 날짜 */
const ago = (back: number) => iso(Date.UTC(2026, 10, 5) - back * DAY);
const at = <T,>(list: readonly T[], i: number) => list[((i % list.length) + list.length) % list.length];
const ref = (id: string, title: string) => `{{${id}|${title}}}`;
/** A · B 목록을 겹치지 않게 엮은 i번째 이름(A를 먼저 다 돌고 B를 바꾼다) */
const combo = (a: readonly string[], b: readonly string[], i: number) => `${a[i % a.length]}${b[Math.floor(i / a.length) % b.length]}`;

/** 시리즈 한 묶음: 한 색인 아래의 같은 꼴 자료 */
interface Series {
  /** 주 분류 색인 id */
  hub: string;
  /** 자료 id 앞부분 */
  key: string;
  /** 원문 폴더(src-*로 시작) */
  dir: string;
  n: number;
  title: (i: number) => string;
  summary: (i: number) => string;
  /** 본문 줄(제목 아래 목록) */
  lines: (i: number) => string[];
  /** 파일 이름(확장자 포함). 기본은 key-001.md */
  file?: (i: number) => string;
  format?: (i: number) => DocFormat;
  updated: (i: number) => string;
  topics?: (i: number) => (string | false)[];
  listedBy?: (i: number) => (string | false)[];
  /** 앞 기록 링크 이름(null이면 잇지 않는다) */
  chain?: string | null;
  /** 모든 자료가 기준으로 잇는 문서 [id, 제목] */
  base?: [string, string];
  /** 다른 시리즈 · 기존 문서로 가는 링크 [이름, id, 제목] */
  cross?: (i: number) => [string, string, string] | null;
}

const hub = (id: string, kind: Seed['kind'], title: string, path: string, parent: string, updated: string, summary: string, body: string): Seed =>
  ({ id, kind, title, path, parent, updated, summary, body });

/** 새 안내 문서: 영역 1 · MOC 6 · 하위 색인 · 프로젝트 안내 */
export const scaleHubs: Seed[] = [
  hub('area-community', 'area', '커뮤니티', 'community.md', 'router', '2026-11-04',
    '오픈소스 · 모임 · 발표 · 멘토링처럼 회사 밖에서 함께 한 일을 모은 영역 색인입니다.',
    '커뮤니티 영역의 색인입니다. 모임과 기여는 활동별 하위 색인에, 여러 번 이어지는 활동은 프로젝트 안내에 둡니다. (모든 모임 · 저장소 · 사람은 가상입니다)'),

  hub('moc-data', 'moc', '데이터', 'moc-데이터.md', 'router', '2026-11-03', '지표 정의 · 데이터셋 · 파이프라인 기록을 영역과 상관없이 모은 주제 지도입니다.', '숫자를 만들고, 옮기고, 믿을 수 있게 하는 자료를 모았습니다.'),
  hub('moc-decision', 'moc', '의사결정', 'moc-의사결정.md', 'router', '2026-11-02', '설계 결정 · 실험 결론 · 개인 선택의 근거를 모은 주제 지도입니다.', '무엇을 골랐고 왜 골랐는지, 다시 볼 때 필요한 근거를 모았습니다.'),
  hub('moc-a11y', 'moc', '접근성', 'moc-접근성.md', 'router', '2026-11-01', '화면 접근성 점검 · 사용성 실험 · 쉬운 글 자료를 모은 주제 지도입니다.', '누구나 읽고 쓸 수 있게 만든 결정과 점검 기록입니다.'),
  hub('moc-habit', 'moc', '습관', 'moc-습관.md', 'router', '2026-10-31', '일과 생활에서 꾸준히 이어 가는 습관 기록을 모은 주제 지도입니다.', '작게 시작해서 오래 이어 간 기록을 모았습니다.'),
  hub('moc-oss', 'moc', '오픈소스', 'moc-오픈소스.md', 'router', '2026-11-04', '오픈소스 기여 · 공개 발표 · 공개 데이터 자료를 모은 주제 지도입니다.', '함께 쓰는 코드와 자료에 보탠 기록입니다. (저장소는 모두 가상)'),
  hub('moc-travel', 'moc', '여행', 'moc-여행.md', 'router', '2026-10-28', '여행 계획 · 출장 · 해외 모임 기록을 모은 주제 지도입니다.', '떠나기 전 준비와 다녀온 뒤 돌아보기를 함께 둡니다.'),

  // ── 업무 ──
  hub('work-archive', 'subindex', '업무 · 지난 프로젝트 보관', 'work--archive.md', 'area-work', '2026-10-30', '끝난 프로젝트(모두 가상)의 기록을 프로젝트별로 나눈 보관 색인.', '진행 중인 프로젝트는 프로젝트 색인에, 끝난 프로젝트는 여기에 둡니다. 다시 열 때는 회고부터 읽습니다.'),
  hub('arc-wave', 'subindex', '업무 · 보관 · 파도 결제 화면 개편', 'work--archive--wave.md', 'work-archive', '2026-06-28', '결제 화면 개편 프로젝트 파도(가상)의 회의 · 결정 · 시험 기록.', '결제 단계를 다섯에서 셋으로 줄인 프로젝트입니다.'),
  hub('arc-lighthouse', 'subindex', '업무 · 보관 · 등대 사내 위키 이전', 'work--archive--lighthouse.md', 'work-archive', '2026-05-30', '사내 위키를 새 도구로 옮긴 프로젝트 등대(가상)의 기록.', '문서 이전 순서와 깨진 링크 정리 기록입니다.'),
  hub('arc-hourglass', 'subindex', '업무 · 보관 · 모래시계 근태 앱', 'work--archive--hourglass.md', 'work-archive', '2026-04-25', '근태 기록 앱 모래시계(가상)의 화면 · 정책 · 시험 기록.', '출퇴근 기록을 두 번 누르지 않게 바꾼 프로젝트입니다.'),
  hub('arc-galaxy', 'subindex', '업무 · 보관 · 은하 추천 실험', 'work--archive--galaxy.md', 'work-archive', '2026-07-20', '추천 영역 실험 프로젝트 은하(가상)의 실험 · 분석 기록.', '추천 줄을 바꿔 가며 반응을 본 실험 묶음입니다.'),
  hub('arc-compass', 'subindex', '업무 · 보관 · 나침반 온보딩 개선', 'work--archive--compass.md', 'work-archive', '2026-08-29', '첫 사용 안내 개선 프로젝트 나침반(가상)의 기록.', '첫 화면에서 할 일 하나만 보여 주도록 바꾼 기록입니다.'),
  hub('arc-pinwheel', 'subindex', '업무 · 보관 · 바람개비 알림 정리', 'work--archive--pinwheel.md', 'work-archive', '2026-09-26', '알림 종류를 정리한 프로젝트 바람개비(가상)의 기록.', '알림 서른 가지를 아홉 가지로 묶은 과정입니다.'),
  hub('client-hanbit', 'subindex', '업무 · 고객사 · 한빛 물류', 'work--clients--hanbit.md', 'work-clients', '2026-11-02', '가상 고객사 한빛 물류의 미팅 · 요구사항 · 주간 보고.', '배송 현황 화면을 함께 만드는 고객사입니다(가상 회사).'),
  hub('client-sodam', 'subindex', '업무 · 고객사 · 소담 출판', 'work--clients--sodam.md', 'work-clients', '2026-10-29', '가상 고객사 소담 출판의 미팅 · 요구사항 · 주간 보고.', '전자책 미리보기를 함께 만드는 고객사입니다(가상 회사).'),
  hub('client-pureun', 'subindex', '업무 · 고객사 · 푸른 의원', 'work--clients--pureun.md', 'work-clients', '2026-10-27', '가상 고객사 푸른 의원의 미팅 · 요구사항 · 주간 보고.', '예약 안내 문구를 함께 고치는 고객사입니다(가상 회사, 진료 정보 없음).'),
  hub('client-daon', 'subindex', '업무 · 고객사 · 다온 교육', 'work--clients--daon.md', 'work-clients', '2026-10-31', '가상 고객사 다온 교육의 미팅 · 요구사항 · 주간 보고.', '수업 자료 검색을 함께 만드는 고객사입니다(가상 회사).'),
  hub('client-mir', 'subindex', '업무 · 고객사 · 미르 여행', 'work--clients--mir.md', 'work-clients', '2026-10-24', '가상 고객사 미르 여행의 미팅 · 요구사항 · 주간 보고.', '일정표 공유 기능을 함께 만드는 고객사입니다(가상 회사).'),
  hub('ops-runbooks', 'subindex', '업무 · 운영 · 런북', 'work--operations--runbooks.md', 'work-ops', '2026-11-01', '반복 운영 작업의 순서와 되돌리는 법을 적은 런북 모음.', '런북은 한 작업에 한 문서, 되돌리는 법을 맨 아래에 둡니다.'),
  hub('ops-oncall', 'subindex', '업무 · 운영 · 당번 일지', 'work--operations--oncall.md', 'work-ops', '2026-11-03', '주간 당번이 남긴 하루 일지 모음.', '당번 일지는 그날 받은 알림과 처리한 일만 짧게 적습니다.'),
  hub('ops-incidents-old', 'subindex', '업무 · 운영 · 장애 기록 · 지난해', 'work--operations--incidents--2025.md', 'work-ops-incidents', '2026-01-10', '지난해 장애 대응 기록을 달 순서로 모은 보관 색인.', '올해 기록은 장애 기록 색인에, 지난해 기록은 여기에 둡니다.'),
  hub('content-blog', 'subindex', '업무 · 콘텐츠 · 블로그', 'work--content--blog.md', 'work-content', '2026-11-02', '회사 블로그 글 초안과 고친 기록(가상).', '초안은 스타일 가이드를 기준으로 두 번 고칩니다.'),
  hub('content-talks', 'subindex', '업무 · 콘텐츠 · 발표 자료', 'work--content--talks.md', 'work-content', '2026-10-30', '사내 · 사외 발표의 개요와 발표 메모.', '발표마다 한 줄 요약 · 개요 · 받은 질문을 남깁니다.'),
  hub('newsletter-old', 'subindex', '업무 · 콘텐츠 · 뉴스레터 · 지난해', 'work--content--newsletter--2025.md', 'work-newsletter', '2026-01-05', '지난해 발행한 뉴스레터 호 모음.', '지난해 호는 여기에 두고 올해 호는 뉴스레터 색인에 둡니다.'),
  hub('work-eng', 'subindex', '업무 · 개발 기록', 'work--engineering.md', 'area-work', '2026-11-04', '설계 결정 · 코드 리뷰 · API 명세처럼 개발 중에 남긴 기록의 색인.', '프로젝트를 가리지 않는 개발 기록을 종류별로 나눴습니다.'),
  hub('eng-adr', 'subindex', '업무 · 개발 · 설계 결정 기록', 'work--engineering--adr.md', 'work-eng', '2026-11-04', '설계 결정 기록(ADR)을 번호 순서로 모은 색인.', '결정 하나에 문서 하나. 바뀐 결정은 지우지 않고 다음 번호로 남깁니다.'),
  hub('eng-review', 'subindex', '업무 · 개발 · 코드 리뷰 메모', 'work--engineering--review.md', 'work-eng', '2026-11-03', '코드 리뷰에서 배운 점을 주제별로 남긴 메모.', '리뷰 한 번에 배운 점 하나만 남깁니다.'),
  hub('eng-api', 'subindex', '업무 · 개발 · API 명세', 'work--engineering--api.md', 'work-eng', '2026-10-31', '사내 서비스 API(가상)의 요청 · 응답 · 오류 명세.', '명세마다 예시 요청 하나와 오류 표를 둡니다.'),
  hub('eng-perf', 'subindex', '업무 · 개발 · 성능 측정 기록', 'work--engineering--performance.md', 'work-eng', '2026-11-02', '화면 · API 성능을 바꾸기 전과 후로 잰 기록(가상 수치 없음).', '재기 전에 무엇을 잴지 먼저 적습니다. 같은 기기 · 같은 자료로 잽니다.'),
  hub('guide-beacon', 'guide', '비컨 데이터 파이프라인 안내', 'project-beacon.md', 'work-projects', '2026-11-04', '이벤트 수집 파이프라인 비컨(가상)의 설계 · 작업 · 점검 문서 읽는 순서.', '수집 정의 → 단계별 작업 기록 → 품질 점검 순서로 읽습니다.'),
  hub('guide-mosaic', 'guide', '모자이크 디자인 시스템 안내', 'project-mosaic.md', 'work-projects', '2026-11-03', '사내 디자인 시스템 모자이크(가상)의 구성 요소 문서 읽는 순서.', '기초(색 · 글꼴 · 간격) → 구성 요소 → 변경 기록 순서로 읽습니다.'),
  hub('guide-relay', 'guide', '릴레이 사내 알림 봇 안내', 'project-relay.md', 'work-projects', '2026-10-30', '팀 채팅 알림 봇 릴레이(가상)의 명령 · 시험 · 운영 문서 안내.', '명령 목록 → 대화 시험 → 운영 기록 순서로 읽습니다.'),

  // ── 개인 ──
  hub('daily-spring', 'subindex', '개인 · 기록 · 4~6월 일일 기록', 'personal--journal--daily--spring.md', 'personal-daily', '2026-06-30', '4월부터 6월까지의 일일 기록을 날짜 순서로 모은 보관 색인.', '석 달치 일일 기록입니다. 주간 정리는 회고 모음에 있습니다.'),
  hub('read-essays', 'subindex', '개인 · 독서 · 에세이 · 인문', 'personal--learning--reading--essays.md', 'personal-reading', '2026-10-30', '가상 에세이 · 인문 도서 독서 메모.', '문장 하나 · 생각 하나 · 질문 하나로 남깁니다.'),
  hub('read-science', 'subindex', '개인 · 독서 · 과학 교양', 'personal--learning--reading--science.md', 'personal-reading', '2026-10-26', '가상 과학 교양 도서 독서 메모.', '처음 안 사실과 더 찾아볼 것을 나눠 적습니다.'),
  hub('read-work', 'subindex', '개인 · 독서 · 일하는 법', 'personal--learning--reading--work.md', 'personal-reading', '2026-10-22', '일하는 방식 · 협업에 관한 가상 도서 독서 메모.', '바로 해 볼 것 하나를 꼭 적습니다.'),
  hub('course-design', 'subindex', '개인 · 강의 · 디자인', 'personal--learning--courses--design.md', 'personal-courses', '2026-10-20', '디자인 온라인 강의(가상)의 강의별 노트.', '강의마다 따라 그린 것과 다시 볼 장면을 남깁니다.'),
  hub('course-data', 'subindex', '개인 · 강의 · 데이터 분석', 'personal--learning--courses--data.md', 'personal-courses', '2026-10-25', '데이터 분석 온라인 강의(가상)의 강의별 노트.', '강의마다 연습 문제와 막힌 곳을 남깁니다.'),
  hub('jp-words', 'subindex', '개인 · 일본어 · 단어장', 'personal--learning--japanese--words.md', 'guide-japanese', '2026-10-29', '일본어 공부의 주제별 단어장 묶음(가상 교재 기준).', '주제마다 단어 스무 개와 예문 세 개를 둡니다.'),
  hub('kitchen-recipes', 'subindex', '개인 · 요리 · 레시피 카드', 'personal--life--kitchen--recipes.md', 'personal-kitchen', '2026-10-28', '집에서 해 본 요리의 레시피 카드.', '재료 · 순서 · 다음에 바꿀 것 세 칸으로 씁니다.'),
  hub('life-home', 'subindex', '개인 · 생활 · 집 정리와 수리', 'personal--life--home.md', 'personal-life', '2026-10-27', '집 정리 · 작은 수리 · 살림 도구 기록.', '고친 날짜와 쓴 도구를 남겨 다음에 다시 찾습니다.'),
  hub('travel-trips', 'subindex', '개인 · 여행 · 일정 기록', 'personal--life--travel--trips.md', 'personal-travel', '2026-10-18', '가상 여행 일정의 날짜별 기록.', '여행마다 날짜별로 한 문서씩 남깁니다.'),
  hub('health-sleep', 'subindex', '개인 · 건강 · 수면 기록', 'personal--life--health--sleep.md', 'personal-health', '2026-11-02', '잠든 시간 · 깬 횟수 · 컨디션을 적은 주간 수면 기록.', '한 주에 한 문서. 숫자보다 바꾼 습관을 적습니다.'),
  hub('health-meals', 'subindex', '개인 · 건강 · 식단 기록', 'personal--life--health--meals.md', 'personal-health', '2026-11-01', '주간 식단과 장보기 계획 기록.', '레시피 카드와 이어 두어 장보기 목록을 만듭니다.'),
  hub('garden-log', 'subindex', '개인 · 텃밭 · 관찰 기록', 'personal--life--garden--log.md', 'guide-garden', '2026-10-30', '베란다 화분의 주간 관찰 기록.', '한 주에 한 번, 잎 · 흙 · 물 준 횟수를 적습니다.'),
  hub('guide-swim', 'guide', '수영 배우기 안내', 'project-swim.md', 'personal-health', '2026-10-30', '처음 배우는 수영(가상 강습)의 회차별 기록 안내.', '회차 기록을 순서대로 읽습니다. 호흡이 먼저입니다.'),
  hub('personal-hobby', 'subindex', '개인 · 취미', 'personal--hobby.md', 'area-personal', '2026-11-03', '사진 · 음악 · 영화 · 보드게임 같은 취미 기록의 색인.', '취미마다 하위 색인을 두고, 모임과 겹치는 기록은 커뮤니티 영역과 잇습니다.'),
  hub('hobby-photo', 'subindex', '개인 · 취미 · 사진 산책', 'personal--hobby--photo.md', 'personal-hobby', '2026-11-02', '동네 사진 산책 기록과 고른 사진(설명만).', '산책마다 고른 사진 한 장과 메모를 둡니다. 사진 파일은 설명만 있습니다.'),
  hub('hobby-music', 'subindex', '개인 · 취미 · 기타 연습', 'personal--hobby--music.md', 'personal-hobby', '2026-10-31', '기타 연습 곡(가상)과 연습 기록.', '하루 15분, 곡마다 막힌 마디를 적습니다.'),
  hub('hobby-film', 'subindex', '개인 · 취미 · 영화 감상', 'personal--hobby--film.md', 'personal-hobby', '2026-10-29', '가상 영화 감상 메모.', '장면 하나와 그 장면이 남긴 질문 하나를 적습니다.'),
  hub('hobby-board', 'subindex', '개인 · 취미 · 보드게임', 'personal--hobby--boardgame.md', 'personal-hobby', '2026-10-26', '보드게임(가상) 규칙 메모와 모임 기록.', '처음 하는 사람에게 설명한 순서를 남깁니다.'),

  // ── 연구 ──
  hub('papers-nlp', 'subindex', '연구 · 논문 · 자연어 처리', 'research--papers--nlp.md', 'research-papers', '2026-11-04', '자연어 처리 분야 가상 논문 메모.', '질문 · 방법 · 결과 · 의심할 점 네 칸으로 정리합니다.'),
  hub('papers-vision', 'subindex', '연구 · 논문 · 시각 인식', 'research--papers--vision.md', 'research-papers', '2026-10-30', '시각 인식 분야 가상 논문 메모.', '같은 네 칸 틀을 씁니다.'),
  hub('papers-hci', 'subindex', '연구 · 논문 · 인간-컴퓨터 상호작용', 'research--papers--hci.md', 'research-papers', '2026-11-02', '인간-컴퓨터 상호작용 분야 가상 논문 메모.', '실험 설계와 참여자 수를 꼭 적습니다.'),
  hub('papers-recsys', 'subindex', '연구 · 논문 · 추천 시스템', 'research--papers--recsys.md', 'research-papers', '2026-10-27', '추천 시스템 분야 가상 논문 메모.', '평가 지표와 데이터 규모를 함께 적습니다.'),
  hub('papers-stats', 'subindex', '연구 · 논문 · 통계 방법', 'research--papers--stats.md', 'research-papers', '2026-10-24', '통계 방법 분야 가상 논문 메모.', '가정과 그 가정이 깨질 때를 적습니다.'),
  hub('exp-ab', 'subindex', '연구 · 실험 · A/B 시험', 'research--experiments--ab.md', 'research-experiments', '2026-11-03', '두 안을 나눠 보여 준 A/B 시험 기록(가상 참여자).', '시험마다 가설 · 기간 · 결론을 남깁니다.'),
  hub('exp-usability', 'subindex', '연구 · 실험 · 사용성 실험', 'research--experiments--usability.md', 'research-experiments', '2026-10-29', '과제 수행을 관찰한 사용성 실험 기록(가상 참여자).', '과제마다 성공률보다 막힌 지점을 먼저 적습니다.'),
  hub('exp-pilot', 'subindex', '연구 · 실험 · 예비 실험', 'research--experiments--pilot.md', 'research-experiments', '2026-10-21', '본 실험 전에 작게 돌린 예비 실험 기록.', '예비 실험에서 바꾼 절차를 꼭 남깁니다.'),
  hub('datasets-more', 'subindex', '연구 · 데이터셋 카드 · 추가 수집', 'research--datasets--more.md', 'research-datasets', '2026-10-26', '추가로 만든 가상 데이터셋 카드.', '출처 · 범위 · 주의점 세 칸을 같은 순서로 씁니다.'),
  hub('research-notes', 'subindex', '연구 · 아이디어 노트', 'research--notes.md', 'area-research', '2026-11-04', '연구 질문 후보와 떠오른 생각을 적은 노트.', '질문 하나에 노트 하나. 실험으로 이어지면 실험 기록과 잇습니다.'),
  hub('research-seminars', 'subindex', '연구 · 세미나 기록', 'research--seminars.md', 'area-research', '2026-11-01', '연구실 세미나(가상)의 회차별 기록.', '발표 요약과 질문을 회차마다 남깁니다.'),
  hub('research-reviews', 'subindex', '연구 · 계획 검토 의견', 'research--reviews.md', 'area-research', '2026-10-28', '연구 계획서에 받은 검토 의견과 답변(가상).', '의견마다 답변과 바꾼 곳을 함께 적습니다.'),
  hub('guide-thesis', 'guide', '학위 논문 준비 안내', 'project-thesis.md', 'area-research', '2026-11-04', '학위 논문(가상 주제) 준비 기록을 장별 · 주차별로 읽는 순서.', '주차 기록 → 장 초안 → 지도 의견 순서로 읽습니다.'),
  hub('guide-benchmark', 'guide', '문서 검색 벤치마크 구축 안내', 'project-benchmark.md', 'area-research', '2026-11-02', '문서 검색 벤치마크(가상) 구축의 질의 · 판정 · 평가 기록 안내.', '질의 묶음 → 판정 기준 → 평가 실행 순서로 읽습니다.'),
  hub('guide-replication', 'guide', '재현 연구 안내', 'project-replication.md', 'area-research', '2026-10-29', '가상 논문 결과를 다시 만들어 본 재현 연구 기록 안내.', '원 논문 메모 → 재현 단계 → 차이 분석 순서로 읽습니다.'),

  // ── 커뮤니티 ──
  hub('com-oss', 'subindex', '커뮤니티 · 오픈소스 기여', 'community--opensource.md', 'area-community', '2026-11-04', '가상 오픈소스 저장소에 낸 이슈 · 변경 요청 기록.', '기여 하나에 문서 하나. 받은 리뷰를 그대로 남깁니다.'),
  hub('com-meetups', 'subindex', '커뮤니티 · 밋업 참석 메모', 'community--meetups.md', 'area-community', '2026-11-01', '가상 기술 밋업에서 들은 발표 메모.', '발표마다 한 줄 요약과 해 볼 것을 적습니다.'),
  hub('com-talks', 'subindex', '커뮤니티 · 외부 발표 준비', 'community--talks.md', 'area-community', '2026-10-30', '외부 행사(가상) 발표 준비 기록.', '개요 · 연습 · 받은 질문 순서로 남깁니다.'),
  hub('com-mentoring', 'subindex', '커뮤니티 · 멘토링 기록', 'community--mentoring.md', 'area-community', '2026-11-02', '가상 멘티와 나눈 대화 주제와 다음 약속.', '이름 없이 주제와 약속만 적습니다.'),
  hub('com-study', 'subindex', '커뮤니티 · 스터디 모임 운영', 'community--study-group.md', 'area-community', '2026-10-27', '스터디 모임(가상) 운영 기록과 회차 메모.', '회차마다 준비물 · 진행 · 다음 범위를 적습니다.'),
  hub('com-volunteer', 'subindex', '커뮤니티 · 봉사 기록', 'community--volunteer.md', 'area-community', '2026-10-25', '동네 도서관 · 코딩 교실(가상) 봉사 기록.', '한 일과 다음에 준비할 것을 적습니다.'),
  hub('com-translate', 'subindex', '커뮤니티 · 문서 번역 기여', 'community--translation.md', 'area-community', '2026-10-29', '가상 오픈소스 문서를 한국어로 옮긴 기여 기록.', '문서 한 편에 기록 하나. 용어는 용어집을 따릅니다.'),
  hub('guide-hackathon', 'guide', '해커톤 참가 안내', 'project-hackathon.md', 'area-community', '2026-10-31', '주말 해커톤(가상) 참가 준비 · 진행 · 회고 문서 안내.', '준비 목록 → 시간별 기록 → 회고 순서로 읽습니다.'),
  hub('guide-podcast', 'guide', '팟캐스트 제작 안내', 'project-podcast.md', 'area-community', '2026-11-03', '동료와 만드는 팟캐스트(가상)의 회차 대본 · 편집 기록 안내.', '회차 기획 → 대본 → 편집 메모 순서로 읽습니다.'),
  hub('guide-bookclub', 'guide', '동네 책 모임 안내', 'project-bookclub.md', 'area-community', '2026-10-26', '한 달에 한 번 여는 동네 책 모임(가상)의 회차 기록 안내.', '회차 기록에 함께 읽은 책의 독서 메모를 잇습니다.')
];

// ── 이름 목록(모두 가상) ──
const MEET = ['킥오프', '범위 정리', '화면 검토', '일정 조정', '위험 점검', '시험 계획', '중간 점검', '출시 준비', '출시 직후', '회고'];
const DECIDE = ['저장 방식', '단계 수', '오류 문구', '권한 범위', '캐시 기간', '알림 묶음', '기본값', '측정 기준', '되돌리기 방법', '공개 범위'];

const archive = (key: string, hubId: string, name: string, n: number, start: number, folder: string): Series => ({
  hub: hubId, key, dir: `src-work/archive/${folder}`, n,
  title: i => (i % 3 === 0 ? `${name} 회의록 · ${at(MEET, i / 3 | 0)}${i >= 30 ? ' 2차' : ''}` : i % 3 === 1 ? `${name} 결정 기록 · ${combo(DECIDE, ['', ' 재검토'], (i / 3) | 0)}` : `${name} 시험 기록 ${pad(((i / 3) | 0) + 1)}`),
  summary: i => (i % 3 === 0 ? `${name} 프로젝트(가상)의 회의 요약과 할 일.` : i % 3 === 1 ? `${name}에서 고른 안과 고르지 않은 안, 그 이유.` : `${name} 화면을 가상 기기에서 시험한 기록.`),
  lines: i => (i % 3 === 0 ? ['참석: 기획 · 디자인 · 개발', `안건: ${at(MEET, i / 3 | 0)}`, '할 일: 담당과 기한을 정함'] : i % 3 === 1 ? ['고른 안: 단순한 쪽', '고르지 않은 안: 설정이 많은 쪽', '다시 볼 때: 사용자가 늘면'] : ['기기: 가상 휴대폰 두 대', `결과: ${i % 4 === 0 ? '통과' : '작은 문제 두 건'}`, '다음: 문제 고친 뒤 다시']),
  updated: i => iso(start + i * 2 * DAY), chain: '앞 기록',
  topics: i => [i % 9 === 4 && 'moc-decision', i % 21 === 8 && 'moc-retro', i % 27 === 2 && 'moc-a11y'],
  base: ['projects-checklist', '프로젝트 시작 체크리스트']
});

const CLIENT_TOPICS = ['배송 현황', '권한 설정', '알림 문구', '검색', '내보내기', '첫 화면', '오류 안내', '보고서', '모바일 화면', '일정'];
const client = (key: string, hubId: string, name: string, n: number, start: number, folder: string, extra: string): Series => ({
  hub: hubId, key, dir: `src-work/clients/${folder}`, n,
  title: i => (i % 4 === 3 ? `${name} 주간 보고 ${iso(start + i * 3 * DAY)}` : i % 4 === 0 ? `${name} 미팅 · ${combo(CLIENT_TOPICS, ['', ' 후속'], (i / 4) | 0)}` : i % 4 === 1 ? `${name} 요구사항 · ${combo(CLIENT_TOPICS, ['', ' 변경'], (i / 4) | 0)}` : `${name} 제안 메모 · ${combo([extra, ...CLIENT_TOPICS], ['', ' 2안'], (i / 4) | 0)}`),
  summary: i => `${name}(가상 회사)와 나눈 ${['미팅', '요구사항', '제안', '주간 진행'][i % 4]} 기록.`,
  lines: i => [`주제: ${at(CLIENT_TOPICS, i)}`, `합의: ${i % 2 ? '다음 주까지 시안' : '범위 그대로'}`, '고객 이름 · 연락처는 적지 않음'],
  updated: i => iso(start + i * 3 * DAY), chain: '지난 기록',
  topics: i => [i % 17 === 5 && 'moc-planning', i % 23 === 11 && 'moc-decision', i % 29 === 7 && 'moc-travel'],
  base: ['projects-checklist', '프로젝트 시작 체크리스트']
});

const RUNBOOK = ['배포 되돌리기', '캐시 비우기', '인증서 갱신', '백업 확인', '로그 보관 기간 바꾸기', '권한 회수', '새 팀원 계정', '야간 작업 공지', '지표 수집 재시작', '디스크 정리', '알림 규칙 바꾸기', '점검 페이지 켜기', '대기열 비우기', '검색 색인 다시 만들기', '설정 비교', '읽기 전용 전환', '복구 연습', '용량 늘리기', '오래된 브랜치 정리', '비밀값 교체(값은 적지 않음)'];
const PAPER_Q = ['짧은 문장 분류', '긴 문서 요약', '질의 확장', '대화 의도 찾기', '오탈자 고치기', '문서 묶기', '번역 품질 평가', '키워드 뽑기', '문장 유사도', '표 읽기', '질문 생성', '근거 찾기', '감정 분류', '용어 정리'];
const VISION_Q = ['손글씨 읽기', '영수증 칸 찾기', '도면 기호 찾기', '사진 흐림 판정', '화면 캡처 요소 찾기', '표 영역 찾기', '아이콘 분류', '그림 설명 쓰기', '색 대비 판정', '문서 기울기 바로잡기', '얼굴 없는 사람 수 세기', '간판 글자 읽기'];
const HCI_Q = ['알림 빈도와 피로', '빈 상태 문구', '키보드 이동', '확대 화면 읽기', '검색 결과 미리보기', '되돌리기 버튼', '오류 문구 어조', '첫 사용 안내', '진행 표시', '색만으로 구분하기', '단축키 발견', '긴 목록 훑기', '모바일 한 손 조작'];
const REC_Q = ['처음 방문자 추천', '다양성과 정확도', '오래된 자료 다시 보기', '추천 이유 설명', '인기 편향', '계절 변화', '짧은 기록 추천', '팀 단위 추천', '추천 끄기', '평가 지표 고르기', '데이터 희소성'];
const STAT_Q = ['작은 표본 비교', '여러 번 비교 보정', '효과 크기 읽기', '결측값 다루기', '순서형 응답', '반복 측정', '사전 등록', '부트스트랩 구간', '기준선 차이', '중간 분석 멈추기', '이상값 판정'];
const VENUES = ['가상 학회 A', '가상 학회 B', '가상 학술지 C', '가상 워크숍 D'];
const paper = (key: string, hubId: string, field: string, qs: readonly string[], n: number, start: number, folder: string, topic: string): Series => ({
  hub: hubId, key, dir: `src-research/papers/${folder}`, n,
  title: i => `논문 메모 · ${combo(qs, ['', ' 후속 연구', ' 비교 연구', ' 재검토', ' 대규모 시험', ' 요약 정리'], i)}`,
  summary: i => `${field} 분야 가상 논문(${at(VENUES, i)})을 읽고 네 칸으로 정리한 메모.`,
  lines: i => [`질문: ${at(qs, i)}을(를) 더 잘 할 수 있는가`, `방법: ${i % 3 === 0 ? '작은 모델 비교' : i % 3 === 1 ? '사람 평가' : '공개 자료 재분석'}`, `결과: ${i % 4 === 1 ? '조건부로 좋아짐' : '기준선과 비슷'}`, '의심할 점: 표본 크기 · 평가 기준'],
  updated: i => iso(start + i * 4 * DAY), chain: '함께 읽기',
  topics: i => [i % 6 === 1 && topic, i % 25 === 9 && 'moc-data', i % 31 === 4 && 'moc-ai'],
  cross: i => (i % 5 === 2 ? ['함께 읽은 모임', `rg-session-${i % 16}`, `논문 읽기 모임 ${(i % 16) + 1}회`] : null)
});

/** 시리즈 정의(자료 4,000개 중 마지막 시리즈가 남는 수를 맡는다) */
function plan(): Series[] {
  const S: Series[] = [];
  // ── 업무 · 보관 ──
  S.push(archive('wave', 'arc-wave', '파도', 60, Date.UTC(2026, 1, 2), 'wave'));
  S.push(archive('lighthouse', 'arc-lighthouse', '등대', 60, Date.UTC(2026, 0, 5), 'lighthouse'));
  S.push(archive('hourglass', 'arc-hourglass', '모래시계', 55, Date.UTC(2025, 11, 1), 'hourglass'));
  S.push(archive('galaxy', 'arc-galaxy', '은하', 60, Date.UTC(2026, 2, 2), 'galaxy'));
  S.push(archive('compass', 'arc-compass', '나침반', 55, Date.UTC(2026, 4, 4), 'compass'));
  S.push(archive('pinwheel', 'arc-pinwheel', '바람개비', 50, Date.UTC(2026, 5, 1), 'pinwheel'));
  // ── 업무 · 고객사 ──
  S.push(client('hanbit', 'client-hanbit', '한빛 물류', 56, Date.UTC(2026, 4, 1), 'hanbit', '배송 지도'));
  S.push(client('sodam', 'client-sodam', '소담 출판', 52, Date.UTC(2026, 4, 8), 'sodam', '전자책 미리보기'));
  S.push(client('pureun', 'client-pureun', '푸른 의원', 48, Date.UTC(2026, 5, 3), 'pureun', '예약 안내'));
  S.push(client('daon', 'client-daon', '다온 교육', 52, Date.UTC(2026, 4, 15), 'daon', '수업 자료 검색'));
  S.push(client('mir', 'client-mir', '미르 여행', 50, Date.UTC(2026, 5, 10), 'mir', '일정표 공유'));
  // ── 업무 · 운영 ──
  S.push({ hub: 'ops-runbooks', key: 'runbook', dir: 'src-work/operations/runbooks', n: 60,
    title: i => `런북 · ${combo(RUNBOOK, ['', ' (야간)', ' (주말)'], i)}`,
    summary: i => `"${at(RUNBOOK, i)}" 작업의 순서 · 확인 · 되돌리는 법.`,
    lines: i => ['1. 공지한다', `2. ${at(RUNBOOK, i)}`, '3. 지표가 돌아왔는지 확인한다', '되돌리기: 앞 단계 설정으로 바꾼다'],
    updated: i => ago(200 - i * 3), chain: null, base: ['ops-incident', '장애 대응 기록 양식'],
    topics: i => [i % 12 === 3 && 'moc-dev', i % 19 === 6 && 'moc-habit'] });
  S.push({ hub: 'ops-oncall', key: 'oncall', dir: 'src-work/operations/oncall', n: 70,
    title: i => `당번 일지 ${iso(Date.UTC(2026, 7, 1) + i * DAY)}`, file: i => `${iso(Date.UTC(2026, 7, 1) + i * DAY)}.md`,
    summary: () => '그날 받은 알림과 처리한 일을 짧게 적은 당번 일지(가상).',
    lines: i => [`알림: ${i % 5 === 0 ? '두 건' : i % 5 === 3 ? '없음' : '한 건'}`, `처리: ${at(RUNBOOK, i * 7)}`, '넘길 일: 없음'],
    updated: i => iso(Date.UTC(2026, 7, 1) + i * DAY), chain: '전날 일지',
    cross: i => (i % 4 === 1 ? ['참고한 런북', `runbook-${(i * 7) % 60}`, `런북 · ${combo(RUNBOOK, ['', ' (야간)', ' (주말)'], (i * 7) % 60)}`] : null),
    topics: i => [i % 33 === 10 && 'moc-habit'] });
  S.push({ hub: 'ops-incidents-old', key: 'incident-old', dir: 'src-work/operations/incidents/2025', n: 55,
    title: i => `장애 기록 2025-${pad((i % 12) + 1)} · ${at(['로그인 지연', '결제 실패', '알림 중복', '검색 오류', '이미지 깨짐', '보고서 지연', '권한 오류', '동기화 멈춤', '배포 실패', '용량 부족', '시간대 오류'], i)}`,
    summary: () => '장애 대응 기록 양식으로 남긴 지난해 사건 기록(가상).',
    lines: i => ['영향: 일부 사용자', `원인: ${i % 3 === 0 ? '설정 실수' : i % 3 === 1 ? '외부 서비스 지연' : '용량 예측 실패'}`, '재발 방지: 점검 목록에 한 줄 추가'],
    updated: i => iso(Date.UTC(2025, i % 12, 3 + ((i / 12) | 0) * 5)), chain: null, base: ['ops-incident', '장애 대응 기록 양식'],
    cross: i => (i % 3 === 0 ? ['관련 런북', `runbook-${i % 60}`, `런북 · ${combo(RUNBOOK, ['', ' (야간)', ' (주말)'], i % 60)}`] : null),
    topics: i => [i % 11 === 5 && 'moc-retro', i % 13 === 2 && 'moc-dev'] });
  // ── 업무 · 콘텐츠 ──
  const BLOG = ['검색을 빠르게 만든 세 가지', '디자인 시스템 첫해', '작은 팀의 회고법', '문서로 일하기', '접근성 점검을 습관으로', '데이터 파이프라인 정리', '알림을 줄인 이야기', '첫 화면 실험', '재택 협업 도구', '코드 리뷰 문화', '신입 온보딩', '장애 회고 공개'];
  S.push({ hub: 'content-blog', key: 'blog', dir: 'src-work/content/blog', n: 60,
    title: i => `블로그 초안 · ${combo(BLOG, ['', ' (고친 글)', ' (짧은 판)', ' (영문 요약)', ' (뉴스레터 판)'], i)}`,
    summary: i => `"${at(BLOG, i)}" 글의 ${['첫 초안', '고친 글', '짧은 판', '영문 요약', '뉴스레터 판'][(i / BLOG.length) | 0]}.`,
    lines: i => ['독자: 처음 알게 된 사람', `핵심 한 줄: ${at(BLOG, i)}`, '고칠 것: 문장 길이'],
    updated: i => ago(180 - i * 3), chain: null, base: ['content-style', '글쓰기 스타일 가이드'],
    cross: i => (i >= 12 ? ['앞 판', `blog-${i - 12}`, `블로그 초안 · ${combo(BLOG, ['', ' (고친 글)', ' (짧은 판)', ' (영문 요약)', ' (뉴스레터 판)'], i - 12)}`] : null),
    topics: i => [i % 5 === 2 && 'moc-writing', i % 12 === 4 && 'moc-a11y', i % 15 === 9 && 'moc-oss'] });
  const TALK = ['사내 검색 개선기', '디자인 토큰 도입', '작은 실험 문화', '읽기 쉬운 오류 문구', '데이터 품질 점검', '회의를 줄이는 문서', '모바일 접근성', '추천 실험에서 배운 것', '런북 쓰는 법'];
  S.push({ hub: 'content-talks', key: 'talk', dir: 'src-work/content/talks', n: 45,
    title: i => `발표 자료 · ${combo(TALK, [' 개요', ' 발표 메모', ' 받은 질문', ' 슬라이드 설명', ' 다시 한 발표'], i)}`,
    summary: i => `"${at(TALK, i)}" 발표의 ${['개요', '발표 메모', '받은 질문', '슬라이드 설명', '두 번째 발표 기록'][(i / TALK.length) | 0]}.`,
    lines: () => ['길이: 20분', '핵심: 한 장에 한 메시지', '다음: 질문을 슬라이드에 반영'],
    format: i => (i % 9 === 8 ? 'pdf' : 'md'), file: i => `talk-${pad(i + 1, 3)}.${i % 9 === 8 ? 'pdf' : 'md'}`,
    updated: i => ago(150 - i * 3), chain: '앞 자료',
    topics: i => [i % 4 === 1 && 'moc-writing', i % 9 === 4 && 'moc-oss'] });
  S.push({ hub: 'newsletter-old', key: 'newsletter-old', dir: 'src-work/content/newsletter/2025', n: 52,
    title: i => `뉴스레터 2025년 ${i + 1}호`, file: i => `2025-${pad(i + 1)}.md`,
    summary: i => `지난해 ${((i / 4.4) | 0) + 1}월에 보낸 사내 소식 뉴스레터(가상).`,
    lines: i => [`머리 기사: ${at(BLOG, i)}`, `짧은 소식: ${at(TALK, i)}`, '다음 호 예고'],
    updated: i => iso(Date.UTC(2025, 0, 6) + i * 7 * DAY), chain: '지난 호', base: ['content-style', '글쓰기 스타일 가이드'],
    topics: i => [i % 13 === 6 && 'moc-writing'] });
  // ── 업무 · 개발 ──
  const ADR = ['저장소 하나로 합치기', '설정 파일 형식', '검색 색인 갱신 주기', '이미지 크기 제한', '오류 코드 체계', '시간대 저장', '권한 모델', '캐시 위치', '로그 형식', '테스트 데이터 생성', '배포 주기', '기능 깃발', 'API 버전 규칙', '삭제 대신 보관', '알림 대기열', '접근성 기준 등급', '번역 키 규칙', '다크 모드 색', '파일 업로드 한도', '세션 만료'];
  S.push({ hub: 'eng-adr', key: 'adr', dir: 'src-work/engineering/adr', n: 70,
    title: i => `설계 결정 ${pad(i + 1, 3)} · ${combo(ADR, ['', ' 개정', ' 재개정', ' 폐기'], i)}`, file: i => `adr-${pad(i + 1, 3)}.md`,
    summary: i => `${at(ADR, i)}에 관한 설계 결정 기록(${['처음 결정', '개정', '재개정', '폐기'][(i / ADR.length) | 0]}).`,
    lines: i => ['배경: 같은 문제가 세 번 나옴', `결정: ${at(ADR, i)} — 가장 단순한 안`, '결과: 다시 볼 조건을 적어 둠'],
    updated: i => ago(400 - i * 5), chain: null, base: ['projects-checklist', '프로젝트 시작 체크리스트'],
    cross: i => (i >= 20 ? ['바뀌기 전 결정', `adr-${i - 20}`, `설계 결정 ${pad(i - 19, 3)} · ${combo(ADR, ['', ' 개정', ' 재개정', ' 폐기'], i - 20)}`] : null),
    topics: i => [i % 4 === 0 && 'moc-decision', i % 6 === 3 && 'moc-dev', i % 20 === 15 && 'moc-a11y'] });
  const REVIEW = ['이름 짓기', '작은 함수', '오류 처리', '시험 이름', '주석 대신 이름', '경계값', '로그 남기기', '되돌리기 쉬운 변경', '의존성 줄이기', '읽는 순서', '중복 제거 시점', '성능 측정 먼저', '타입으로 막기'];
  S.push({ hub: 'eng-review', key: 'review', dir: 'src-work/engineering/reviews', n: 65,
    title: i => `리뷰 메모 · ${combo(REVIEW, ['', ' 2', ' 3', ' 4', ' 5'], i)}`,
    summary: i => `코드 리뷰에서 "${at(REVIEW, i)}"에 관해 배운 점.`,
    lines: i => [`배운 점: ${at(REVIEW, i)}`, '예시: 변경 전 · 후 한 줄씩', '다음 리뷰에서 볼 것'],
    updated: i => ago(240 - i * 3), chain: '앞 메모',
    cross: i => (i % 5 === 2 ? ['관련 결정', `adr-${i % 70}`, `설계 결정 ${pad((i % 70) + 1, 3)} · ${combo(ADR, ['', ' 개정', ' 재개정', ' 폐기'], i % 70)}`] : null),
    topics: i => [i % 7 === 3 && 'moc-dev', i % 16 === 8 && 'moc-habit'] });
  const API = ['사용자 조회', '일정 목록', '알림 보내기', '검색', '파일 올리기', '권한 확인', '보고서 만들기', '내보내기', '팀 목록', '설정 바꾸기', '로그인 기록', '태그 붙이기'];
  S.push({ hub: 'eng-api', key: 'api', dir: 'src-work/engineering/api', n: 60,
    title: i => `API 명세 · ${combo(API, [' v1', ' v2', ' 오류 표', ' 예시 모음', ' 변경 기록'], i)}`,
    summary: i => `"${at(API, i)}" API(가상)의 ${[' v1 명세', ' v2 명세', '오류 표', '예시 요청 모음', '변경 기록'][(i / API.length) | 0]}.`,
    lines: i => [`요청: ${at(API, i)}`, '응답: 성공 · 빈 결과 · 오류 세 가지', '주의: 개인 정보 필드 없음'],
    updated: i => ago(220 - i * 3), chain: null,
    cross: i => (i >= 12 ? ['같은 API', `api-${i % 12}`, `API 명세 · ${at(API, i)} v1`] : null),
    topics: i => [i % 8 === 5 && 'moc-dev', i % 14 === 3 && 'moc-data'] });
  const PERF = ['첫 화면 그리기', '검색 응답', '목록 스크롤', '이미지 불러오기', '보고서 만들기', '로그인', '파일 올리기', '설정 저장', '알림 목록', '대시보드 열기', '내보내기', '앱 시작'];
  S.push({ hub: 'eng-perf', key: 'perf', dir: 'src-work/engineering/performance', n: 60,
    title: i => `성능 측정 · ${combo(PERF, [' 기준선', ' 개선 1차', ' 개선 2차', ' 모바일', ' 회귀 확인'], i)}`,
    summary: i => `"${at(PERF, i)}"을(를) 같은 기기 · 같은 자료로 잰 기록.`,
    lines: () => ['잴 것: 사용자가 기다리는 시간', '조건: 같은 기기 · 같은 자료', '결론: 숫자보다 바뀐 이유를 적음'],
    updated: i => ago(210 - i * 3), chain: null,
    cross: i => (i >= 12 ? ['기준선', `perf-${i % 12}`, ''] : i % 4 === 1 ? ['관련 결정', `adr-${i * 3}`, ''] : null),
    topics: i => [i % 6 === 2 && 'moc-dev', i % 10 === 5 && 'moc-data'] });
  // ── 업무 · 프로젝트 안내 ──
  const BEACON = ['수집 정의', '이벤트 이름 규칙', '중복 제거', '지연 도착 처리', '일별 집계', '품질 점검', '재처리', '보관 기간', '스키마 변경', '대시보드 연결', '비용 점검', '장애 연습', '샘플링'];
  S.push({ hub: 'guide-beacon', key: 'beacon', dir: 'src-work/projects/beacon', n: 65,
    title: i => `비컨 ${combo(BEACON, [' 설계', ' 작업 기록', ' 점검', ' 회고', ' 개선'], i)}`,
    summary: i => `이벤트 파이프라인 비컨(가상)의 ${at(BEACON, i)} ${[' 설계', ' 작업 기록', ' 점검', ' 회고', ' 개선'][(i / BEACON.length) | 0].trim()}.`,
    lines: i => [`단계: ${at(BEACON, i)}`, '확인: 하루치 표본으로', `지표: ${ref('lumen-metrics', '루멘 핵심 지표 정의')}와 맞춘다`],
    updated: i => ago(160 - i * 2), chain: '앞 단계',
    topics: i => [i % 3 === 1 && 'moc-data', i % 10 === 6 && 'moc-decision'] });
  const MOSAIC = ['색', '글꼴', '간격', '버튼', '입력칸', '표', '대화상자', '알림 띠', '탭', '아이콘', '빈 상태', '불러오는 중', '오류 상태', '목록'];
  S.push({ hub: 'guide-mosaic', key: 'mosaic', dir: 'src-work/projects/mosaic', n: 70,
    title: i => `모자이크 ${combo(MOSAIC, [' 원칙', ' 구성 요소', ' 접근성 점검', ' 변경 기록', ' 사용 예'], i)}`,
    summary: i => `디자인 시스템 모자이크(가상)의 ${at(MOSAIC, i)} 문서.`,
    lines: i => [`대상: ${at(MOSAIC, i)}`, '규칙: 한 가지 쓰임에 한 가지 모양', `점검: ${ref('nova-a11y', '노바 접근성 점검 목록')}`],
    updated: i => ago(140 - i * 2), chain: null,
    cross: i => (i >= 14 ? ['같은 요소', `mosaic-${i % 14}`, `모자이크 ${at(MOSAIC, i)} 원칙`] : null),
    topics: i => [i % 5 === 1 && 'moc-design', i % 7 === 2 && 'moc-a11y'] });
  const RELAY = ['/오늘', '/회의', '/휴가', '/배포', '/당번', '/요약', '/알림끄기', '/도움말', '/검색', '/투표', '/기록', '/할일'];
  S.push({ hub: 'guide-relay', key: 'relay', dir: 'src-work/projects/relay', n: 60,
    title: i => `릴레이 ${combo(RELAY, [' 명령 설명', ' 대화 시험', ' 오류 기록', ' 개선 메모', ' 운영 기록'], i)}`,
    summary: i => `알림 봇 릴레이(가상)의 ${at(RELAY, i)} 명령 기록.`,
    lines: i => [`명령: ${at(RELAY, i)}`, '응답: 세 줄 안에', '사람 확인: 필요한 경우만'],
    updated: i => ago(120 - i * 2), chain: '앞 기록',
    cross: i => (i % 6 === 0 ? ['알림을 받은 당번', `oncall-${i % 70}`, ''] : null),
    topics: i => [i % 9 === 3 && 'moc-ai', i % 11 === 7 && 'moc-dev'] });

  // ── 개인 ──
  const SPRING = Date.UTC(2026, 3, 1);
  S.push({ hub: 'daily-spring', key: 'daily-spring', dir: 'src-personal/journal/daily', n: 86,
    title: i => { const d = new Date(SPRING + i * DAY); return `일일 기록 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; },
    file: i => `${iso(SPRING + i * DAY)}.md`,
    summary: () => '기분 · 한 일 · 내일 할 일을 적은 짧은 기록(가상).',
    lines: i => [`기분: ${at(['맑음', '조금 피곤', '집중 잘 됨', '바쁨', '차분함', '산만함', '설렘'], i)}`, `한 일: ${at(['산책', '독서', '요리', '기타 연습', '수영', '사진 정리', '스터디'], i * 3)}`],
    updated: i => iso(SPRING + i * DAY), chain: '전날',
    topics: i => [i % 29 === 12 && 'moc-habit'] });
  const ESSAY = ['느린 산책', '작은 방', '오래된 엽서', '이웃의 시간', '빈 책상', '바다의 문장', '겨울 일기', '읽는 사람', '기억의 지도', '조용한 일', '두 번째 계절', '말의 무게'];
  S.push({ hub: 'read-essays', key: 'essay', dir: 'src-personal/learning/reading/essays', n: 60,
    title: i => `독서 메모 · ${combo(ESSAY, ['', ' (다시 읽기)', ' (모임 발제)', ' (인용 모음)', ' (짧은 감상)'], i)}`,
    summary: i => `가상 에세이 "${at(ESSAY, i)}"를 읽고 남긴 메모.`,
    lines: () => ['기억할 문장 하나', '떠오른 장면 하나', '남은 질문 하나'],
    updated: i => ago(300 - i * 4), chain: '함께 읽기',
    topics: i => [i % 8 === 3 && 'moc-writing', i % 15 === 7 && 'moc-habit'] });
  const SCI = ['잠의 과학', '작은 생물', '별의 일생', '숫자의 감각', '기후의 기록', '뇌와 습관', '빛의 성질', '바다 밑 지도', '시간의 측정', '진화의 증거', '물질의 상태', '우연의 수학'];
  S.push({ hub: 'read-science', key: 'science', dir: 'src-personal/learning/reading/science', n: 60,
    title: i => `독서 메모 · ${combo(SCI, ['', ' (요약)', ' (질문 목록)', ' (그림 설명)', ' (다시 읽기)'], i)}`,
    summary: i => `가상 과학 교양서 "${at(SCI, i)}"의 메모.`,
    lines: () => ['처음 안 사실', '더 찾아볼 것', '일상에서 본 예'],
    updated: i => ago(280 - i * 4), chain: '함께 읽기',
    cross: i => (i % 12 === 5 ? ['이어 볼 기록', `sleep-${i % 60}`, `수면 기록 ${iso(Date.UTC(2025, 11, 1) + (i % 60) * 7 * DAY)} 주`] : null),
    topics: i => [i % 9 === 2 && 'moc-health', i % 14 === 6 && 'moc-data'] });
  const WORKB = ['깊이 일하기', '함께 쓰는 문서', '좋은 질문', '작게 나누기', '피드백 주고받기', '회의 없는 오후', '결정 기록', '느슨한 연결', '일의 우선순위', '쉬는 기술', '배우는 조직'];
  S.push({ hub: 'read-work', key: 'workbook', dir: 'src-personal/learning/reading/work', n: 55,
    title: i => `독서 메모 · ${combo(WORKB, ['', ' (실천 기록)', ' (팀 공유판)', ' (반론)', ' (요약 카드)'], i)}`,
    summary: i => `일하는 법에 관한 가상 도서 "${at(WORKB, i)}"의 메모.`,
    lines: () => ['바로 해 볼 것 하나', '팀에 나눌 것 하나', '맞지 않는 점 하나'],
    updated: i => ago(260 - i * 4), chain: '함께 읽기',
    topics: i => [i % 6 === 1 && 'moc-planning', i % 7 === 4 && 'moc-decision', i % 13 === 9 && 'moc-habit'] });
  const DESIGN_C = ['그리드', '타이포그래피', '색 대비', '아이콘 그리기', '정보 위계', '모바일 화면', '프로토타입', '사용자 인터뷰', '여백', '데이터 표', '움직임', '디자인 비평'];
  S.push({ hub: 'course-design', key: 'course-design', dir: 'src-personal/learning/courses/design', n: 55,
    title: i => `디자인 강의 노트 · ${combo(DESIGN_C, [' 1강', ' 2강', ' 실습', ' 과제', ' 복습'], i)}`,
    summary: i => `가상 디자인 강의의 "${at(DESIGN_C, i)}" 노트.`,
    lines: i => [`주제: ${at(DESIGN_C, i)}`, '따라 한 것: 화면 하나', '다시 볼 장면: 강의 중반'],
    updated: i => ago(230 - i * 3), chain: '앞 강의',
    topics: i => [i % 4 === 2 && 'moc-design', i % 9 === 5 && 'moc-a11y'] });
  const DATA_C = ['표 다루기', '그래프 고르기', '평균의 함정', '분포 보기', '상관과 인과', '시계열', '결측값', '집계 쿼리', '대시보드 설계', '보고서 쓰기', '실험 분석', '군집 나누기'];
  S.push({ hub: 'course-data', key: 'course-data', dir: 'src-personal/learning/courses/data', n: 60,
    title: i => `데이터 강의 노트 · ${combo(DATA_C, [' 1강', ' 2강', ' 연습 문제', ' 과제', ' 복습'], i)}`,
    summary: i => `가상 데이터 분석 강의의 "${at(DATA_C, i)}" 노트.`,
    lines: i => [`주제: ${at(DATA_C, i)}`, '연습: 가상 표 하나', `기준: ${ref('learn-viz-book', '독서 메모 · 데이터 시각화 입문')}`],
    updated: i => ago(210 - i * 3), chain: '앞 강의',
    topics: i => [i % 3 === 1 && 'moc-data', i % 10 === 4 && 'moc-method'] });
  const WORDS = ['날씨', '음식', '교통', '가게', '시간', '가족', '학교', '회사', '취미', '여행', '병원', '은행', '집', '감정', '계절'];
  S.push({ hub: 'jp-words', key: 'jp-words', dir: 'src-personal/learning/japanese/words', n: 60,
    title: i => `일본어 단어장 · ${combo(WORDS, [' 기초', ' 예문', ' 복습', ' 시험'], i)}`,
    summary: i => `"${at(WORDS, i)}" 주제 단어 스무 개와 예문(가상 교재).`,
    lines: i => [`주제: ${at(WORDS, i)}`, '외운 단어: 스무 개', '틀린 단어: 다시 적기'],
    updated: i => ago(190 - i * 3), chain: '앞 단어장',
    cross: i => (i % 15 === 9 ? ['쓰인 곳', `trip-${i % 60}`, `여행 기록 · ${combo(TRIP, [' 첫째 날', ' 둘째 날', ' 셋째 날', ' 돌아보기'], i % 60)}`] : null),
    topics: i => [i % 20 === 11 && 'moc-travel', i % 17 === 3 && 'moc-habit'] });
  const DISH = ['된장찌개', '김치볶음밥', '두부조림', '닭가슴살 샐러드', '토마토 달걀볶음', '버섯 리소토', '잡채', '미역국', '카레', '감자전', '연어 덮밥', '들기름 국수', '오트밀 죽', '시금치 무침', '떡볶이', '새우 볶음밥', '콩나물국', '가지 구이'];
  S.push({ hub: 'kitchen-recipes', key: 'recipe', dir: 'src-personal/life/kitchen/recipes', n: 72,
    title: i => `레시피 카드 · ${combo(DISH, ['', ' (간단 판)', ' (도시락 판)', ' (손님상 판)'], i)}`,
    summary: i => `${at(DISH, i)}의 재료 · 순서 · 다음에 바꿀 것.`,
    lines: i => [`재료: 집에 있는 것 ${4 + (i % 4)}가지`, '순서: 다섯 단계 안', '바꿀 것: 간을 조금 약하게'],
    updated: i => ago(250 - i * 3), chain: null,
    format: i => (i % 18 === 17 ? 'image' : 'md'), file: i => `recipe-${pad(i + 1, 3)}.${i % 18 === 17 ? 'jpg' : 'md'}`,
    cross: i => (i >= 18 && i % 18 !== 17 ? ['기본 판', `recipe-${i % 18}`, `레시피 카드 · ${at(DISH, i)}`] : null),
    topics: i => [i % 8 === 2 && 'moc-health', i % 24 === 13 && 'moc-habit'] });
  const HOME = ['책장 정리', '수전 교체', '창틀 실리콘', '옷장 계절 정리', '전등 교체', '방충망 수리', '냉장고 정리', '서류 정리', '공구함 정리', '현관 정리', '욕실 줄눈', '화분 분갈이'];
  S.push({ hub: 'life-home', key: 'home', dir: 'src-personal/life/home', n: 55,
    title: i => `집 기록 · ${combo(HOME, ['', ' (다시 함)', ' (도구 목록)', ' (계절 점검)', ' (메모)'], i)}`,
    summary: i => `${at(HOME, i)}을(를) 한 날의 기록과 쓴 도구.`,
    lines: () => ['걸린 시간: 한 시간 안', '쓴 도구: 기본 공구', '다음: 같은 계절에 다시'],
    updated: i => ago(270 - i * 4), chain: null,
    topics: i => [i % 11 === 4 && 'moc-habit'] });
  const TRIP = ['남해 바닷가', '강릉 커피 거리', '제주 동쪽', '경주 골목', '전주 시장', '부산 산복도로', '가상 도시 한라', '가상 섬 소라', '속초 아침', '여수 밤바다', '안동 하회', '담양 대숲', '통영 섬길', '춘천 호수', '가상 산마을'];
  S.push({ hub: 'travel-trips', key: 'trip', dir: 'src-personal/life/travel/trips', n: 60,
    title: i => `여행 기록 · ${combo(TRIP, [' 첫째 날', ' 둘째 날', ' 셋째 날', ' 돌아보기'], i)}`,
    summary: i => `${at(TRIP, i)} 여행(가상 일정)의 ${['첫째 날', '둘째 날', '셋째 날', '돌아보기'][(i / TRIP.length) | 0]} 기록.`,
    lines: () => ['이동: 대중교통', '좋았던 것 하나', '다음에 바꿀 것 하나'],
    updated: i => ago(330 - i * 5), chain: null,
    cross: i => (i >= 15 ? ['같은 여행', `trip-${i - 15}`, `여행 기록 · ${combo(TRIP, [' 첫째 날', ' 둘째 날', ' 셋째 날', ' 돌아보기'], i - 15)}`] : null),
    topics: i => [i % 4 === 3 && 'moc-travel', i % 15 === 6 && 'moc-habit'] });
  S.push({ hub: 'health-sleep', key: 'sleep', dir: 'src-personal/life/health/sleep', n: 60,
    title: i => `수면 기록 ${iso(Date.UTC(2025, 11, 1) + i * 7 * DAY)} 주`, file: i => `week-${iso(Date.UTC(2025, 11, 1) + i * 7 * DAY)}.md`,
    summary: () => '한 주의 잠든 시간 · 깬 횟수 · 컨디션과 바꾼 습관(가상).',
    lines: i => [`잠든 시간: ${at(['자정 전', '자정 무렵', '새벽 한 시'], i)}`, `깬 횟수: ${i % 3}번`, `바꾼 습관: ${at(['화면 끄기', '저녁 산책', '카페인 줄이기', '같은 시간 기상'], i)}`],
    updated: i => iso(Date.UTC(2025, 11, 7) + i * 7 * DAY), chain: '지난주',
    topics: i => [i % 5 === 2 && 'moc-health', i % 7 === 4 && 'moc-habit'] });
  S.push({ hub: 'health-meals', key: 'meals', dir: 'src-personal/life/health/meals', n: 58,
    title: i => `식단 기록 ${iso(Date.UTC(2025, 11, 1) + i * 7 * DAY)} 주`, file: i => `week-${iso(Date.UTC(2025, 11, 1) + i * 7 * DAY)}.md`,
    summary: () => '한 주의 식단과 장보기 목록(가상).',
    lines: i => ['아침: 간단히', '저녁: 레시피 카드 하나', `장보기: ${at(DISH, i)} 재료`],
    updated: i => iso(Date.UTC(2025, 11, 7) + i * 7 * DAY), chain: '지난주',
    cross: i => (i % 18 === 17 ? null : ['만든 요리', `recipe-${i % 18}`, `레시피 카드 · ${at(DISH, i)}`]),
    topics: i => [i % 6 === 1 && 'moc-health'] });
  S.push({ hub: 'guide-swim', key: 'swim', dir: 'src-personal/life/health/swim', n: 52,
    title: i => `수영 강습 ${pad(i + 1)}회차`,
    summary: i => `${at(['호흡', '발차기', '팔 젓기', '자유형 25m', '배영', '턴', '평영 발차기', '오래 떠 있기'], i)} 중심으로 배운 날(가상 강습).`,
    lines: i => [`오늘 배운 것: ${at(['호흡', '발차기', '팔 젓기', '자유형 25m', '배영', '턴', '평영 발차기', '오래 떠 있기'], i)}`, `잘 된 것: ${i % 2 ? '호흡 박자' : '몸 띄우기'}`, '다음 회차: 같은 동작 열 번'],
    updated: i => ago(200 - i * 3), chain: '지난 회차', base: ['life-workout', '운동 루틴'],
    topics: i => [i % 6 === 4 && 'moc-health', i % 9 === 1 && 'moc-habit'] });
  const PLANT = ['방울토마토', '상추', '바질', '대파', '고추', '로즈메리', '딸기'];
  S.push({ hub: 'garden-log', key: 'garden-week', dir: 'src-personal/life/garden/log', n: 63,
    title: i => `텃밭 관찰 · ${combo(PLANT, [' 1주', ' 2주', ' 3주', ' 4주', ' 5주', ' 6주', ' 7주', ' 8주', ' 9주'], i)}`,
    summary: i => `${at(PLANT, i)} 화분의 ${((i / PLANT.length) | 0) + 1}주째 관찰 기록.`,
    lines: i => [`잎: ${i % 3 === 0 ? '새 잎 두 장' : '그대로'}`, `물: 주 ${2 + (i % 2)}회`, `다음: ${i % 4 === 0 ? '지지대 세우기' : '그대로 두기'}`],
    updated: i => ago(160 - i * 2), chain: null,
    cross: i => (i >= PLANT.length ? ['지난주', `garden-week-${i - PLANT.length}`, ''] : null),
    topics: i => [i % 8 === 5 && 'moc-habit'] });
  const WALK = ['골목 그림자', '비 온 뒤', '아침 시장', '공원 벤치', '강변 노을', '오래된 간판', '창문들', '겨울 나무', '계단', '고양이 산책길', '버스 정류장', '빈 놀이터'];
  S.push({ hub: 'hobby-photo', key: 'photo', dir: 'src-personal/hobby/photo', n: 60,
    title: i => (i % 3 === 2 ? `고른 사진 · ${combo(WALK, ['', ' 2'], (i / 3) | 0)}.jpg` : `사진 산책 · ${combo(WALK, [' 메모', ' 다시 걷기', ' 해 질 녘', ' 이른 아침'], i - ((i / 3) | 0))}`),
    summary: i => (i % 3 === 2 ? `"${at(WALK, (i / 3) | 0)}" 산책에서 고른 사진. 이 데모는 사진을 보여 주지 않고 설명만 있습니다.` : `"${at(WALK, i - ((i / 3) | 0))}" 주제로 동네를 걸으며 찍은 기록.`),
    lines: () => ['시간: 오후 한 시간', '빛: 옆에서 들어오는 빛', '고른 사진: 한 장'],
    format: i => (i % 3 === 2 ? 'image' : 'md'), file: i => (i % 3 === 2 ? `pick-${pad(i + 1, 3)}.jpg` : `walk-${pad(i + 1, 3)}.md`),
    updated: i => ago(310 - i * 5), chain: null,
    topics: i => [i % 9 === 4 && 'moc-habit', i % 12 === 7 && 'moc-travel'] });
  const SONG = ['가상 곡 봄비', '가상 곡 정류장', '가상 곡 오후 세 시', '가상 곡 파란 문', '가상 곡 첫눈', '가상 곡 골목길', '가상 곡 작은 배', '가상 곡 등불', '가상 곡 바람 소리', '가상 곡 긴 여름', '가상 곡 새벽'];
  S.push({ hub: 'hobby-music', key: 'guitar', dir: 'src-personal/hobby/guitar', n: 55,
    title: i => `기타 연습 · ${combo(SONG, [' 코드 익히기', ' 리듬', ' 전주', ' 끝까지', ' 녹음 메모'], i)}`,
    summary: i => `${at(SONG, i)} 연습 기록. 막힌 마디와 고친 손 모양.`,
    lines: () => ['연습 시간: 15분', '막힌 곳: 코드 바꾸는 마디', '다음: 느린 박자로 다시'],
    updated: i => ago(230 - i * 4), chain: '앞 연습',
    topics: i => [i % 6 === 2 && 'moc-habit'] });
  const FILM = ['긴 오후', '두 개의 창', '여름의 끝', '조용한 기차', '빛나는 골목', '마지막 편지', '섬의 겨울', '이름 없는 가게', '먼 바다', '세 번째 손님', '오래된 극장', '새벽 정류장', '작은 영웅'];
  S.push({ hub: 'hobby-film', key: 'film', dir: 'src-personal/hobby/film', n: 65,
    title: i => `영화 메모 · ${combo(FILM, ['', ' (다시 봄)', ' (장면 메모)', ' (모임 이야기)', ' (짧은 감상)'], i)}`,
    summary: i => `가상 영화 "${at(FILM, i)}"를 보고 남긴 장면 하나와 질문 하나.`,
    lines: () => ['장면: 한 장면만', '질문: 그 장면이 남긴 것', '같이 볼 사람: 모임'],
    updated: i => ago(290 - i * 4), chain: null,
    cross: i => (i >= 13 ? ['처음 본 기록', `film-${i % 13}`, `영화 메모 · ${at(FILM, i)}`] : null),
    topics: i => [i % 13 === 5 && 'moc-writing'] });
  const GAME = ['가상 게임 별자리', '가상 게임 항구', '가상 게임 정원사', '가상 게임 탐험대', '가상 게임 시장', '가상 게임 등대지기', '가상 게임 열차', '가상 게임 도서관', '가상 게임 숲'];
  S.push({ hub: 'hobby-board', key: 'board', dir: 'src-personal/hobby/boardgame', n: 45,
    title: i => `보드게임 · ${combo(GAME, [' 규칙 메모', ' 설명 순서', ' 모임 기록', ' 전략 메모', ' 다시 한 날'], i)}`,
    summary: i => `${at(GAME, i)}의 규칙 · 처음 하는 사람에게 설명한 순서.`,
    lines: () => ['인원: 서너 명', '설명: 이기는 법부터', '시간: 40분'],
    updated: i => ago(250 - i * 5), chain: null,
    cross: i => (i % 9 === 4 ? ['함께 한 모임', `study-${i % 55}`, `스터디 모임 ${pad((i % 55) + 1)}회차`] : null),
    topics: i => [i % 15 === 7 && 'moc-habit'] });

  // ── 연구 ──
  S.push(paper('nlp', 'papers-nlp', '자연어 처리', PAPER_Q, 70, Date.UTC(2025, 9, 1), 'nlp', 'moc-ai'));
  S.push(paper('vision', 'papers-vision', '시각 인식', VISION_Q, 60, Date.UTC(2025, 10, 1), 'vision', 'moc-ai'));
  S.push(paper('hci', 'papers-hci', '인간-컴퓨터 상호작용', HCI_Q, 65, Date.UTC(2025, 9, 15), 'hci', 'moc-a11y'));
  S.push(paper('recsys', 'papers-recsys', '추천 시스템', REC_Q, 55, Date.UTC(2025, 11, 1), 'recsys', 'moc-data'));
  S.push(paper('stats', 'papers-stats', '통계 방법', STAT_Q, 55, Date.UTC(2025, 10, 15), 'stats', 'moc-method'));
  const AB = ['버튼 이름', '첫 화면 문구', '추천 줄 순서', '알림 시간', '검색창 위치', '요금표 순서', '빈 상태 그림', '가입 단계 수', '메일 제목', '목록 밀도', '도움말 위치', '색 강조'];
  S.push({ hub: 'exp-ab', key: 'ab', dir: 'src-research/experiments/ab', n: 65,
    title: i => `A/B 시험 · ${combo(AB, ['', ' 2차', ' 3차', ' 모바일', ' 재시험', ' 장기'], i)}`,
    summary: i => `"${at(AB, i)}" 두 안을 가상 참여자에게 나눠 보여 준 시험.`,
    lines: i => [`가설: ${at(AB, i)}을(를) 바꾸면 행동이 달라진다`, `기간: ${7 + (i % 3) * 7}일`, `결론: ${i % 3 === 0 ? '차이 없음' : i % 3 === 1 ? '작은 차이' : '다시 시험'}`],
    updated: i => ago(260 - i * 3), chain: null,
    cross: i => (i % 4 === 2 ? ['분석 방법', `stats-${i % 55}`, `논문 메모 · ${combo(STAT_Q, ['', ' 후속 연구', ' 비교 연구', ' 재검토', ' 대규모 시험', ' 요약 정리'], i % 55)}`] : i >= 12 ? ['앞 시험', `ab-${i - 12}`, `A/B 시험 · ${combo(AB, ['', ' 2차', ' 3차', ' 모바일', ' 재시험', ' 장기'], i - 12)}`] : null),
    topics: i => [i % 4 === 1 && 'moc-method', i % 9 === 5 && 'moc-data', i % 11 === 3 && 'moc-decision'] });
  const UX_T = ['일정 옮기기', '파일 찾기', '설정 되돌리기', '알림 끄기', '공유 링크 만들기', '표 정렬', '검색 필터', '도움말 찾기', '계정 바꾸기', '사진 올리기', '글 고치기'];
  S.push({ hub: 'exp-usability', key: 'usab', dir: 'src-research/experiments/usability', n: 55,
    title: i => `사용성 실험 · ${combo(UX_T, ['', ' (모바일)', ' (확대 화면)', ' (키보드)', ' (재실험)'], i)}`,
    summary: i => `"${at(UX_T, i)}" 과제를 가상 참여자 다섯 명이 수행한 기록.`,
    lines: i => [`과제: ${at(UX_T, i)}`, '막힌 지점: 두 곳', '바꿀 것: 이름과 위치'],
    updated: i => ago(240 - i * 3), chain: null,
    cross: i => (i % 5 === 3 ? ['관련 논문', `hci-${i % 65}`, `논문 메모 · ${combo(HCI_Q, ['', ' 후속 연구', ' 비교 연구', ' 재검토', ' 대규모 시험', ' 요약 정리'], i % 65)}`] : null),
    topics: i => [i % 3 === 0 && 'moc-a11y', i % 7 === 2 && 'moc-design', i % 13 === 8 && 'moc-method'] });
  S.push({ hub: 'exp-pilot', key: 'pilot', dir: 'src-research/experiments/pilot', n: 50,
    title: i => `예비 실험 ${pad(i + 1)} · ${at(['절차 시간 재기', '안내문 이해도', '설문 길이', '과제 난이도', '녹화 동의 절차', '보상 방식', '화면 크기', '참여자 모집 문구'], i)}`,
    summary: () => '본 실험 전에 가상 참여자 두세 명으로 절차를 시험한 기록.',
    lines: () => ['참여자: 두세 명', '바꾼 절차: 한 가지', '본 실험 반영: 예'],
    updated: i => ago(220 - i * 3), chain: '앞 예비 실험',
    topics: i => [i % 5 === 1 && 'moc-method'] });
  const DS2 = ['문서 길이 표본', '검색어 표본', '세션 길이 표본', '버튼 클릭 표본', '오류 문구 표본', '화면 크기 표본', '응답 시간 표본', '태그 표본', '파일 형식 표본', '알림 열람 표본'];
  S.push({ hub: 'datasets-more', key: 'ds2', dir: 'src-research/datasets/more', n: 60,
    title: i => `데이터셋 카드 · ${combo(DS2, [' 3', ' 4', ' 5', ' 6', ' 7', ' 8'], i)}`,
    summary: i => `가상 데이터셋 "${at(DS2, i)}"의 ${((i / DS2.length) | 0) + 3}번째 수집 카드.`,
    lines: () => ['출처: 데모용 가상 기록', '범위: 한 달', '주의: 개인 식별 정보 없음'],
    updated: i => ago(320 - i * 4), chain: null,
    cross: i => (i >= 10 ? ['앞 수집', `ds2-${i - 10}`, `데이터셋 카드 · ${combo(DS2, [' 3', ' 4', ' 5', ' 6', ' 7', ' 8'], i - 10)}`] : null),
    topics: i => [i % 4 === 2 && 'moc-data'] });
  const IDEA = ['검색어 없는 검색', '읽은 흔적 보여 주기', '느린 추천', '문서 나이 표시', '회의록 자동 묶기', '질문으로 찾기', '색인 자동 제안', '중복 자료 알림', '읽기 순서 추천', '관계 강도 보기', '잊힌 자료 깨우기', '요약의 요약'];
  S.push({ hub: 'research-notes', key: 'idea', dir: 'src-research/notes', n: 70,
    title: i => `아이디어 노트 · ${combo(IDEA, ['', ' (반론)', ' (실험 설계)', ' (관련 연구)', ' (보류)', ' (다시 꺼냄)'], i)}`,
    summary: i => `연구 질문 후보 "${at(IDEA, i)}" 노트.`,
    lines: () => ['질문 한 줄', '왜 중요한가', '가장 작은 실험'],
    updated: i => ago(200 - i * 2), chain: null,
    cross: i => (i % 6 === 2 ? ['이어진 시험', `ab-${i % 65}`, `A/B 시험 · ${combo(AB, ['', ' 2차', ' 3차', ' 모바일', ' 재시험', ' 장기'], i % 65)}`] : i >= 12 ? ['처음 노트', `idea-${i % 12}`, `아이디어 노트 · ${at(IDEA, i)}`] : null),
    topics: i => [i % 7 === 3 && 'moc-ai', i % 9 === 6 && 'moc-decision', i % 10 === 1 && 'moc-method'] });
  S.push({ hub: 'research-seminars', key: 'seminar', dir: 'src-research/seminars', n: 60,
    title: i => `연구실 세미나 ${pad(i + 1)}회 · ${at(['논문 발표', '진행 보고', '방법 토론', '데이터 공유', '초청 발표(가상)', '실험 설계 검토'], i)}`,
    summary: () => '연구실 세미나(가상)의 발표 요약과 받은 질문.',
    lines: i => [`형식: ${at(['논문 발표', '진행 보고', '방법 토론', '데이터 공유', '초청 발표', '실험 설계 검토'], i)}`, '질문: 세 개', '다음 발표자: 순번대로'],
    updated: i => ago(400 - i * 7), chain: '지난 회',
    cross: i => (i % 3 === 0 ? ['발표 논문', `${at(['nlp', 'vision', 'hci', 'recsys', 'stats'], i / 3)}-${(i * 2) % 55}`, `논문 메모 · ${combo(at([PAPER_Q, VISION_Q, HCI_Q, REC_Q, STAT_Q], i / 3), ['', ' 후속 연구', ' 비교 연구', ' 재검토', ' 대규모 시험', ' 요약 정리'], (i * 2) % 55)}`] : null),
    topics: i => [i % 12 === 5 && 'moc-method'] });
  S.push({ hub: 'research-reviews', key: 'rev', dir: 'src-research/reviews', n: 45,
    title: i => `검토 의견 ${pad(i + 1)} · ${at(['표본 크기', '대조군', '측정 도구', '윤리 절차', '분석 계획', '일반화 범위', '선행 연구', '일정', '데이터 관리'], i)}`,
    summary: () => '연구 계획서에 받은 검토 의견과 답변(가상).',
    lines: () => ['의견 요지 한 줄', '답변: 바꾼 곳 표시', '남은 걱정: 하나'],
    updated: i => ago(180 - i * 3), chain: null, base: ['research-pdf-0', '연구 데이터 관리 규칙.pdf'],
    topics: i => [i % 5 === 2 && 'moc-method', i % 8 === 6 && 'moc-decision'] });
  S.push({ hub: 'guide-thesis', key: 'thesis', dir: 'src-research/thesis', n: 70,
    title: i => (i % 5 === 4 ? `학위 논문 ${at(['서론', '선행 연구', '방법', '결과', '논의', '결론', '부록'], (i / 5) | 0)} 초안 ${((i / 35) | 0) + 1}판` : `학위 논문 주간 기록 ${pad(i - ((i / 5) | 0) + 1)}주차`),
    summary: i => (i % 5 === 4 ? '학위 논문(가상 주제) 장 초안과 지도 의견 반영 기록.' : '한 주 동안 한 일 · 막힌 곳 · 다음 주 계획.'),
    lines: i => (i % 5 === 4 ? ['분량: 지난 판보다 짧게', '지도 의견: 그림 먼저', '고친 곳: 문단 순서'] : ['한 일: 문헌 정리 · 분석', '막힌 곳: 하나', '다음 주: 장 초안']),
    updated: i => ago(360 - i * 5), chain: '앞 기록',
    cross: i => (i % 7 === 3 ? ['참고한 실험', `pilot-${i % 50}`, ''] : null),
    topics: i => [i % 6 === 2 && 'moc-method', i % 14 === 9 && 'moc-writing', i % 10 === 7 && 'moc-habit'] });
  const QSET = ['짧은 질의', '긴 질의', '오탈자 질의', '동의어 질의', '날짜 질의', '사람 없는 이름 질의', '영문 섞인 질의', '질문형 질의', '목록 찾기 질의', '최근 문서 질의', '모호한 질의', '부정 질의', '파일 형식 질의'];
  S.push({ hub: 'guide-benchmark', key: 'bench', dir: 'src-research/benchmark', n: 65,
    title: i => `벤치마크 ${combo(QSET, [' 질의 묶음', ' 판정 기준', ' 판정 결과', ' 평가 실행', ' 오류 분석'], i)}`,
    summary: i => `문서 검색 벤치마크(가상)의 "${at(QSET, i)}" ${['질의 묶음', '판정 기준', '판정 결과', '평가 실행', '오류 분석'][(i / QSET.length) | 0]}.`,
    lines: () => ['질의 수: 50개(가상)', '판정: 두 사람이 따로', '불일치: 세 번째 사람이 정함'],
    updated: i => ago(170 - i * 2), chain: null,
    cross: i => (i >= 13 ? ['같은 질의 묶음', `bench-${i % 13}`, `벤치마크 ${at(QSET, i)} 질의 묶음`] : null),
    topics: i => [i % 4 === 3 && 'moc-data', i % 9 === 1 && 'moc-method', i % 16 === 6 && 'moc-oss'] });
  S.push({ hub: 'guide-replication', key: 'repl', dir: 'src-research/replication', n: 55,
    title: i => `재현 연구 · ${at(['원 논문 메모', '환경 맞추기', '데이터 다시 받기', '전처리 재현', '기준선 재현', '본 결과 재현', '차이 분석', '저자에게 묻기', '보고서 초안', '공개 정리', '되짚기'], i)} ${((i / 11) | 0) + 1}`,
    summary: i => `가상 논문 재현의 "${at(['원 논문 메모', '환경 맞추기', '데이터 다시 받기', '전처리 재현', '기준선 재현', '본 결과 재현', '차이 분석', '저자에게 묻기', '보고서 초안', '공개 정리', '되짚기'], i)}" 단계 기록.`,
    lines: () => ['원 결과와 차이: 작음', '원인 후보: 전처리', '공개: 코드 설명만'],
    updated: i => ago(150 - i * 2), chain: '앞 단계',
    topics: i => [i % 5 === 1 && 'moc-method', i % 8 === 3 && 'moc-oss'] });

  // ── 커뮤니티 ──
  const REPO = ['가상 저장소 달빛 편집기', '가상 저장소 작은 지도', '가상 저장소 표 변환기', '가상 저장소 한글 검사기', '가상 저장소 일정 달력', '가상 저장소 색 대비 도구', '가상 저장소 문서 사이트 틀', '가상 저장소 로그 뷰어', '가상 저장소 설문 도구', '가상 저장소 접근성 점검기', '가상 저장소 이미지 줄이기', '가상 저장소 단축키 모음', '가상 저장소 번역 키 검사'];
  S.push({ hub: 'com-oss', key: 'oss', dir: 'src-personal/community/opensource', n: 65,
    title: i => `오픈소스 기여 · ${combo(REPO, [' 이슈', ' 문서 고침', ' 시험 추가', ' 기능 제안', ' 리뷰 받음'], i)}`,
    summary: i => `${at(REPO, i)}에 낸 ${['이슈', '문서 수정', '시험 추가', '기능 제안', '변경 요청 리뷰'][(i / REPO.length) | 0]} 기록.`,
    lines: () => ['무엇을: 한 가지 변경', '받은 리뷰: 이름 바꾸기', '결과: 반영됨'],
    updated: i => ago(220 - i * 3), chain: null,
    cross: i => (i % 7 === 2 ? ['배운 점', `review-${i % 65}`, `리뷰 메모 · ${combo(REVIEW, ['', ' 2', ' 3', ' 4', ' 5'], i % 65)}`] : i >= 13 ? ['같은 저장소', `oss-${i % 13}`, `오픈소스 기여 · ${at(REPO, i)} 이슈`] : null),
    topics: i => [i % 3 === 1 && 'moc-oss', i % 13 === 9 && 'moc-a11y', i % 15 === 4 && 'moc-dev'] });
  const MEETUP = ['가상 밋업 프런트엔드 저녁', '가상 밋업 데이터 수다', '가상 밋업 접근성 모임', '가상 밋업 디자인 시스템', '가상 밋업 연구 공유회', '가상 밋업 작은 팀 운영', '가상 밋업 검색 엔지니어링', '가상 밋업 글쓰기 클럽', '가상 밋업 오픈소스의 밤', '가상 밋업 해외 원격 근무', '가상 밋업 AI 도구'];
  S.push({ hub: 'com-meetups', key: 'meetup', dir: 'src-personal/community/meetups', n: 60,
    title: i => `밋업 메모 · ${combo(MEETUP, [' 1회', ' 2회', ' 3회', ' 4회', ' 5회', ' 6회'], i)}`,
    summary: i => `${at(MEETUP, i)}에서 들은 발표 요약과 해 볼 것.`,
    lines: () => ['발표: 두 개', '한 줄 요약: 작게 시작하기', '해 볼 것: 하나'],
    updated: i => ago(300 - i * 5), chain: null,
    cross: i => (i % 8 === 5 ? ['돌아와 쓴 글', `blog-${i % 60}`, `블로그 초안 · ${combo(BLOG, ['', ' (고친 글)', ' (짧은 판)', ' (영문 요약)', ' (뉴스레터 판)'], i % 60)}`] : i >= 11 ? ['지난 회', `meetup-${i - 11}`, `밋업 메모 · ${combo(MEETUP, [' 1회', ' 2회', ' 3회', ' 4회', ' 5회', ' 6회'], i - 11)}`] : null),
    topics: i => [i % 6 === 3 && 'moc-oss', i % 10 === 9 && 'moc-travel', i % 11 === 2 && 'moc-a11y'] });
  S.push({ hub: 'com-talks', key: 'extalk', dir: 'src-personal/community/talks', n: 50,
    title: i => `외부 발표 준비 · ${combo(TALK, [' 개요', ' 연습 1', ' 연습 2', ' 받은 질문', ' 돌아보기', ' 공개 자료'], i)}`,
    summary: i => `외부 행사(가상)에서 "${at(TALK, i)}" 발표를 준비한 기록.`,
    lines: () => ['청중: 처음 듣는 사람', '연습: 시간 재기', '받은 질문: 세 개'],
    updated: i => ago(260 - i * 4), chain: null,
    cross: i => (i % 9 === 0 ? ['사내 판', `talk-${i % 45}`, `발표 자료 · ${combo(TALK, [' 개요', ' 발표 메모', ' 받은 질문', ' 슬라이드 설명', ' 다시 한 발표'], i % 45)}`] : null),
    listedBy: i => [i % 9 === 0 && 'content-talks'],
    topics: i => [i % 5 === 2 && 'moc-oss', i % 8 === 6 && 'moc-writing', i % 17 === 11 && 'moc-travel'] });
  const MENTOR = ['첫 이직 준비', '포트폴리오 고르기', '코드 리뷰 받는 법', '면접 연습', '공부 계획', '첫 팀 적응', '발표 연습', '글쓰기 습관', '질문하는 법', '일정 잡기', '쉬는 법', '오픈소스 시작'];
  S.push({ hub: 'com-mentoring', key: 'mentor', dir: 'src-personal/community/mentoring', n: 60,
    title: i => `멘토링 · ${combo(MENTOR, [' 1차', ' 2차', ' 3차', ' 4차', ' 마무리'], i)}`,
    summary: i => `가상 멘티와 "${at(MENTOR, i)}"를 이야기한 기록(이름 없음).`,
    lines: () => ['주제 한 줄', '함께 정한 약속', '다음 만남: 2주 뒤'],
    updated: i => ago(240 - i * 3), chain: null,
    cross: i => (i >= 12 ? ['지난 만남', `mentor-${i - 12}`, `멘토링 · ${combo(MENTOR, [' 1차', ' 2차', ' 3차', ' 4차', ' 마무리'], i - 12)}`] : null),
    topics: i => [i % 6 === 1 && 'moc-habit', i % 9 === 4 && 'moc-decision'] });
  S.push({ hub: 'com-study', key: 'study', dir: 'src-personal/community/study-group', n: 55,
    title: i => `스터디 모임 ${pad(i + 1)}회차`,
    summary: i => `${at(['알고리즘', '디자인 비평', '데이터 분석', '글쓰기', '논문 읽기'], i)} 스터디 모임(가상)의 회차 기록.`,
    lines: i => [`범위: ${at(['한 장', '두 문제', '한 화면', '한 편'], i)}`, '진행: 30분 발표 · 30분 토론', '다음 범위: 다음 장'],
    updated: i => ago(380 - i * 7), chain: '지난 회차',
    cross: i => (i % 10 === 4 ? ['함께 읽은 논문', `nlp-${i % 70}`, `논문 메모 · ${combo(PAPER_Q, ['', ' 후속 연구', ' 비교 연구', ' 재검토', ' 대규모 시험', ' 요약 정리'], i % 70)}`] : null),
    topics: i => [i % 7 === 5 && 'moc-habit'] });
  S.push({ hub: 'guide-hackathon', key: 'hack', dir: 'src-personal/community/hackathon', n: 55,
    title: i => `해커톤 ${at(['봄', '여름', '가을'], (i / 19) | 0)} · ${at(['준비 목록', '주제 고르기', '팀 역할', '첫 시간', '여섯 시간째', '밤 열두 시', '새벽 정리', '시연 준비', '발표', '심사 질문', '회고', '코드 공개', '사진 메모', '다음에 할 것', '도구 목록', '시간표', '식사 메모', '받은 의견', '뒷정리'], i)}`,
    summary: () => '주말 해커톤(가상) 참가 기록.',
    lines: () => ['팀: 셋', '만든 것: 작은 도구 하나', '배운 것: 범위를 줄이기'],
    updated: i => ago(330 - i * 4), chain: '앞 기록',
    topics: i => [i % 6 === 3 && 'moc-oss', i % 9 === 7 && 'moc-retro'] });
  S.push({ hub: 'guide-podcast', key: 'pod', dir: 'src-personal/community/podcast', n: 60,
    title: i => `팟캐스트 ${pad(((i / 3) | 0) + 1)}화 ${['기획', '대본', '편집 메모'][i % 3]}`,
    summary: i => `동료와 만드는 팟캐스트(가상) ${((i / 3) | 0) + 1}화의 ${['기획', '대본', '편집 메모'][i % 3]}.`,
    lines: i => [`주제: ${at([...BLOG, ...TALK], (i / 3) | 0)}`, '길이: 25분', '편집: 말 줄임 구간 정리'],
    updated: i => ago(280 - i * 3), chain: '앞 기록', base: ['content-style', '글쓰기 스타일 가이드'],
    topics: i => [i % 12 === 7 && 'moc-writing'] });
  S.push({ hub: 'guide-bookclub', key: 'bookclub', dir: 'src-personal/community/bookclub', n: 40,
    title: i => `동네 책 모임 ${pad(i + 1)}회`,
    summary: i => `함께 읽은 가상 도서 "${at([...ESSAY, ...SCI, ...WORKB], i)}" 이야기(가상 모임).`,
    lines: () => ['참석: 여섯 명', '이야기한 장면: 둘', '다음 책: 투표로'],
    updated: i => ago(400 - i * 9), chain: '지난 모임',
    cross: i => ['읽은 책 메모', `${at(['essay', 'science', 'workbook'], i)}-${i % 55}`, ''],
    topics: i => [i % 6 === 2 && 'moc-writing', i % 11 === 5 && 'moc-habit'] });
  const DOCS = ['시작하기', '설치 안내', '자주 묻는 질문', '기여 안내', '행동 강령', '설정 옵션', '명령 목록', '문제 해결', '변경 기록', '접근성 안내', '용어집'];
  S.push({ hub: 'com-translate', key: 'translate', dir: 'src-personal/community/translation', n: 55,
    title: i => `번역 기여 · ${at(REPO, (i / DOCS.length) | 0).replace('가상 저장소 ', '')} ${at(DOCS, i)}`,
    summary: i => `${at(REPO, (i / DOCS.length) | 0)}의 "${at(DOCS, i)}" 문서를 한국어로 옮긴 기록.`,
    lines: () => ['분량: 한 화면', '어려웠던 용어: 둘', '리뷰: 한 번 고침'],
    updated: i => ago(230 - i * 3), chain: null, base: ['content-style', '글쓰기 스타일 가이드'],
    cross: i => (i % DOCS.length === 0 ? ['같은 저장소 기여', `oss-${((i / DOCS.length) | 0) % 13}`, ''] : null),
    topics: i => [i % 4 === 1 && 'moc-oss', i % 18 === 0 && 'moc-writing', i % 11 === 9 && 'moc-a11y'] });
  // 남는 수를 맡는 마지막 시리즈: 봉사 기록(n은 scaleMaterials에서 정한다)
  S.push({ hub: 'com-volunteer', key: 'volunteer', dir: 'src-personal/community/volunteer', n: 0,
    title: i => `봉사 기록 ${pad(i + 1)} · ${at(['동네 도서관 서가 정리', '어린이 코딩 교실', '어르신 휴대폰 교실', '헌책 나눔', '공원 정리', '점자 자료 입력', '쉬운 글 고치기'], i)}`,
    summary: () => '동네 도서관 · 코딩 교실(가상) 봉사 기록.',
    lines: () => ['한 일: 두 시간', '만난 사람: 이름 없이', '다음에 준비할 것: 하나'],
    updated: i => ago(360 - i * 6), chain: '지난 기록',
    topics: i => [i % 7 === 6 && 'moc-a11y', i % 9 === 4 && 'moc-habit'] });
  return S;
}

/** 주제 MOC 하나가 담는 관련 자료 상한(기존 자료 포함). MOC 문서가 100줄을 넘지 않게 한다 */
export const MOC_ITEM_CAP = 88;

/**
 * 시리즈를 자료로 펼친다. budget = 만들 자료 수(마지막 시리즈가 남는 수를 맡는다).
 * mocUsed = 기존 자료가 이미 쓰는 MOC별 관련 자료 수. 후보가 남는 자리보다 많으면 시리즈 전체에 고르게 솎는다.
 */
export function scaleMaterials(budget: number, mocUsed: ReadonlyMap<string, number> = new Map()): Seed[] {
  const series = plan();
  const fixed = series.reduce((t, s) => t + s.n, 0);
  const left = budget - fixed;
  if (left < 30 || left > 80) throw new Error(`데모 규모 조정 필요: 봉사 기록 ${left}건`);
  series[series.length - 1].n = left;
  const titles = new Map<string, string>();
  for (const s of series) for (let i = 0; i < s.n; i++) titles.set(`${s.key}-${i}`, s.title(i));
  const out: Seed[] = [];
  for (const s of series) {
    for (let i = 0; i < s.n; i++) {
      const id = `${s.key}-${i}`;
      const format = s.format?.(i) ?? 'md';
      const links: string[] = [];
      if (s.base) links.push(`기준: ${ref(s.base[0], s.base[1])}`);
      const cross = s.cross?.(i);
      if (cross) {
        const label = titles.get(cross[1]) ?? cross[2];
        if (!label) throw new Error(`데모 참조 이름 없음: ${id} → ${cross[1]}`);
        links.push(`${cross[0]}: ${ref(cross[1], label)}`);
      }
      if (s.chain !== null && i > 0) links.push(`${s.chain ?? '앞 기록'}: ${ref(`${s.key}-${i - 1}`, s.title(i - 1))}`);
      const topics = (s.topics?.(i) ?? []).filter((t): t is string => !!t);
      const listedBy = (s.listedBy?.(i) ?? []).filter((t): t is string => !!t);
      out.push({
        id, kind: 'material', title: s.title(i), path: `${s.dir}/${s.file?.(i) ?? `${s.key}-${pad(i + 1, 3)}.md`}`, parent: s.hub,
        updated: s.updated(i), summary: s.summary(i), format: format === 'md' ? undefined : format,
        topics: topics.length ? topics : undefined, listedBy: listedBy.length ? listedBy : undefined,
        body: format === 'md' ? `# ${s.title(i)}\n\n${s.lines(i).map(l => (/^\d+\./.test(l) ? l : `- ${l}`)).join('\n')}${links.length ? `\n\n${links.join('\n')}` : ''}` : undefined
      });
    }
  }
  // MOC 솎기: 후보 순서대로 등간격으로 남는 자리만큼 고른다
  const cands = new Map<string, Seed[]>();
  for (const m of out) for (const t of m.topics ?? []) cands.set(t, [...(cands.get(t) ?? []), m]);
  for (const [moc, list] of cands) {
    const room = Math.max(0, MOC_ITEM_CAP - (mocUsed.get(moc) ?? 0));
    if (list.length <= room) continue;
    list.forEach((m, r) => {
      if (Math.floor(((r + 1) * room) / list.length) > Math.floor((r * room) / list.length)) return;
      const left = m.topics!.filter(t => t !== moc);
      m.topics = left.length ? left : undefined;
    });
  }
  return out;
}
