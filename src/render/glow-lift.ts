// Node glow depth correction (same formula as the NODE_VERT shader). Tests use it to check the screen position stays the same.

/** Pull a point in view space (camera = origin) toward the camera by lift along the camera→point ray. Minimum distance 0.03 */
export function liftAlongRay(eye: readonly [number, number, number], lift: number): [number, number, number] {
  const len = Math.hypot(eye[0], eye[1], eye[2]);
  const k = Math.max(0.03, len - lift) / Math.max(len, 1e-4);
  return [eye[0] * k, eye[1] * k, eye[2] * k];
}

/** Outer sphere radius of an assembly: half width (farthest axis distance) × √3 × node scale */
export const assemblyRadius = (half: number, scale: number) => half * Math.sqrt(3) * scale;
