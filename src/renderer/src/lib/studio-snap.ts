/**
 * Snapping for canvas drags: the dragged layer's box pulls onto the canvas
 * centre lines and edges when it gets close enough.
 *
 * Pure math over the box the drag started from — the box is measured once at
 * pointer-down and the snap works on `box + delta`, so no re-measuring happens
 * during the drag. Guides come back in document coordinates so the overlay can
 * draw the line the layer snapped to.
 */

export interface SnapGuides {
  /** X of the vertical guide line the layer snapped to, or null. */
  v: number | null
  /** Y of the horizontal guide line the layer snapped to, or null. */
  h: number | null
}

export interface SnapResult {
  dx: number
  dy: number
  guides: SnapGuides
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Adjust a drag delta so the moved box lands on the nearest guide within
 * `threshold` document pixels. Per axis, the closest of: box centre to canvas
 * centre, leading edge to the canvas edge, trailing edge to the far edge.
 * Centre wins ties — centring is the intent far more often than edge-flushing.
 */
export function snapDrag(
  box: Box,
  dx: number,
  dy: number,
  canvasW: number,
  canvasH: number,
  threshold: number,
): SnapResult {
  const axis = (
    lead: number,
    size: number,
    delta: number,
    canvasSize: number,
  ): { delta: number; guide: number | null } => {
    const moved = lead + delta
    const candidates: Array<{ target: number; at: number; guide: number }> = [
      // centre → canvas centre (listed first so it wins equal distances)
      { target: canvasSize / 2, at: moved + size / 2, guide: canvasSize / 2 },
      // leading edge → canvas start
      { target: 0, at: moved, guide: 0 },
      // trailing edge → canvas end
      { target: canvasSize, at: moved + size, guide: canvasSize },
    ]
    let best: { delta: number; guide: number | null; dist: number } = {
      delta,
      guide: null,
      dist: threshold + 1,
    }
    for (const c of candidates) {
      const dist = Math.abs(c.at - c.target)
      if (dist <= threshold && dist < best.dist) {
        best = { delta: delta + (c.target - c.at), guide: c.guide, dist }
      }
    }
    return { delta: best.delta, guide: best.guide }
  }

  const h = axis(box.x, box.width, dx, canvasW)
  const v = axis(box.y, box.height, dy, canvasH)
  return { dx: h.delta, dy: v.delta, guides: { v: h.guide, h: v.guide } }
}
