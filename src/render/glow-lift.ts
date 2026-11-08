// 노드 발광 깊이 보정의 계산(NODE_VERT 셰이더와 같은 식). 시험에서 화면 위치 불변을 확인하는 데 쓴다.

/** 시점 좌표(카메라 = 원점)의 점을 카메라→점 광선 위에서 lift만큼 카메라 쪽으로 당긴다. 최소 거리 0.03 */
export function liftAlongRay(eye: readonly [number, number, number], lift: number): [number, number, number] {
  const len = Math.hypot(eye[0], eye[1], eye[2]);
  const k = Math.max(0.03, len - lift) / Math.max(len, 1e-4);
  return [eye[0] * k, eye[1] * k, eye[2] * k];
}

/** 조립의 바깥 구 반지름: 반폭(가장 먼 축 거리) × √3 × 노드 배율 */
export const assemblyRadius = (half: number, scale: number) => half * Math.sqrt(3) * scale;
