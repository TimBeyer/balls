export interface LinearBoundary {
  position: number
  velocity: number
  target: number
}

export function earliestBoundaryCrossing(boundaries: LinearBoundary[]): { dt: number; index: number } | null {
  let minDt = Infinity
  let bestIndex = -1
  for (let i = 0; i < boundaries.length; i++) {
    const { position, velocity, target } = boundaries[i]
    const dt = (target - position) / velocity
    if (dt > Number.EPSILON && dt < minDt) {
      minDt = dt
      bestIndex = i
    }
  }
  if (bestIndex === -1) return null
  return { dt: minDt, index: bestIndex }
}
