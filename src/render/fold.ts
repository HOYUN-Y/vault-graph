// 접힌 덩어리(큰 그래프)의 크기 · 이름표 규칙. 장면(BrainScene)과 시험이 함께 쓰는 순수 계산이다.
/** 접힌 덩어리 크기 배율: 하위 수의 로그(수천 개짜리가 다른 노드를 덮지 않게 상한) */
export const foldScale = (count: number) => Math.min(2.4, 1 + 0.3 * Math.log10(1 + count));
/** 이름표 글자: 접힌 덩어리는 제목 뒤에 +개수 */
export const labelText = (title: string, count: number | undefined) => (count ? `${title} +${count.toLocaleString('ko-KR')}` : title);
