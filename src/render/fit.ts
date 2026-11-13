// Fit-all distance (pure — no Three.js dependency, used as-is in Node tests).
// The closest distance at which every node assembly stays inside the safe area (minus top bar, toolbar and legend) through one auto-rotation turn (around the vertical axis) from the default view direction.
// The camera looks at the origin; the screen center is shifted to the safe area's center (BrainScene's view offset).
import type { Vec3 } from '../core/layout3d';

export interface FitInput {
  /** Node centers (world coordinates, before rotation) */
  points: Vec3[];
  /** Half width of each node assembly (to the outermost face) */
  halves: ArrayLike<number>;
  /** View direction from the origin toward the camera (need not be normalized) */
  dir: Vec3;
  /** Vertical field of view (radians) */
  vfov: number;
  /** Canvas width/height (px) */
  width: number;
  height: number;
  /** Covered edges (px) */
  insets: { top: number; right: number; bottom: number; left: number };
  /** Inner margin of the safe area (px) */
  margin?: number;
  /** Number of sample angles per turn (movement between samples is added as slack, so every angle stays inside the safe area) */
  steps?: number;
  /** Size of the toolbar covering the bottom-right corner (portrait phone control bar) (px, from the canvas right and bottom edges) */
  corner?: { w: number; h: number };
  /** Projection center offset (px, center = screen middle − offset). Used for the distance to the bar when corner is set */
  offset?: { x: number; y: number };
}

export function fitDistance({ points, halves, dir, vfov, width, height, insets, margin = 14, steps = 120, corner, offset = { x: 0, y: 0 } }: FitInput): number {
  const len = Math.hypot(...dir) || 1;
  const z: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
  // Camera axes: right = up × z, up' = z × right (up = +y)
  const xl = Math.hypot(z[2], z[0]) || 1;
  const x: Vec3 = [z[2] / xl, 0, -z[0] / xl];
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const tv = Math.tan(vfov / 2), th = tv * (width / height);
  // Safe-area half width as a ratio of the screen half width (the offset makes the safe-area center the projection center)
  const ax = Math.max(0.2, (width - insets.left - insets.right - 2 * margin) / width);
  const ay = Math.max(0.2, (height - insets.top - insets.bottom - 2 * margin) / height);
  // Corner bar: a node is fine if it's left of the bar's left edge or above its top edge (either). Distance from the projection center to those lines, as a ratio of screen half width/height
  const bx = corner ? (width - corner.w - margin - (width / 2 - offset.x)) / (width / 2) : 0;
  const by = corner ? (height - corner.h - margin - (height / 2 - offset.y)) / (height / 2) : 0;
  const useCorner = !!corner && corner.w > 0 && corner.h > 0 && (bx > 0 || by > 0);
  let d = 0;
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const px = p[0] * c + p[2] * sn, pz = -p[0] * sn + p[2] * c, py = p[1];
      const cx = px * x[0] + py * x[1] + pz * x[2];
      const cy = px * y[0] + py * y[1] + pz * y[2];
      const cz = px * z[0] + py * z[1] + pz * z[2];
      // To the assembly corner (with cube-diagonal slack) + max movement between sample angles (arc length)
      const r = (halves[i] ?? 0) * 1.4 + Math.hypot(p[0], p[2]) * (Math.PI / steps);
      d = Math.max(d, (Math.abs(cx) + r) / (ax * th) + cz + r, (Math.abs(cy) + r) / (ay * tv) + cz + r);
      if (useCorner) {
        // The nearer of: distance where the right end (cx + r) clears the bar's left line, or where the bottom end (−cy + r) clears its top line
        const ex = cx + r, ey = r - cy;
        const dx = ex <= 0 ? 0 : bx > 0 ? ex / (bx * th) + cz + r : Infinity;
        const dy = ey <= 0 ? 0 : by > 0 ? ey / (by * tv) + cz + r : Infinity;
        const need = Math.min(dx, dy);
        if (need < Infinity) d = Math.max(d, need);
      }
    }
  }
  return d;
}
