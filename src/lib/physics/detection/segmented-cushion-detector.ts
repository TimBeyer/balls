/**
 * Segmented cushion collision detector for tables with pockets.
 *
 * Like QuadraticCushionDetector, solves a*t^2 + b*t + (c - wall) = 0 for each wall,
 * but walls are broken into segments with gaps at pocket mouths. After finding the
 * collision time, validates that the ball's position along the segment falls within
 * [segment.start, segment.end].
 */

import type Ball from '../../ball'
import { Cushion } from '../../cushion'
import type { CushionCollision } from '../../collision'
import { solveQuadratic } from '../../polynomial-solver'
import type { CushionDetector } from './collision-detector'
import type { CushionSegment } from '../../table-config'

const DIRECTION_TO_CUSHION: Record<CushionSegment['direction'], Cushion> = {
  north: Cushion.North,
  east: Cushion.East,
  south: Cushion.South,
  west: Cushion.West,
}

export class SegmentedCushionDetector implements CushionDetector {
  private segments: CushionSegment[]

  constructor(segments: CushionSegment[]) {
    this.segments = segments
  }

  detect(circle: Ball, tableWidth: number, tableHeight: number): CushionCollision {
    const traj = circle.trajectory
    const r = circle.radius
    const maxDt = traj.maxDt

    let minDt = Infinity
    let bestCushion = Cushion.North

    for (const seg of this.segments) {
      let wallPos: number
      let a: number, b: number, c: number
      let parallelA: number, parallelB: number, parallelC: number

      if (seg.axis === 'y') {
        // North/South wall: y = value ∓ r
        if (seg.direction === 'north') {
          wallPos = seg.value - r
        } else {
          wallPos = seg.value + r
        }
        a = traj.a[1]
        b = traj.b[1]
        c = traj.c[1] - wallPos
        // Parallel axis is x
        parallelA = traj.a[0]
        parallelB = traj.b[0]
        parallelC = traj.c[0]
      } else {
        // East/West wall: x = value ∓ r
        if (seg.direction === 'east') {
          wallPos = seg.value - r
        } else {
          wallPos = seg.value + r
        }
        a = traj.a[0]
        b = traj.b[0]
        c = traj.c[0] - wallPos
        // Parallel axis is y
        parallelA = traj.a[1]
        parallelB = traj.b[1]
        parallelC = traj.c[1]
      }

      const roots = solveQuadratic(a, b, c)
      for (const dt of roots) {
        if (dt > Number.EPSILON && dt < minDt && dt <= maxDt) {
          // Check that collision point falls within segment bounds
          const parallelPos = parallelA * dt * dt + parallelB * dt + parallelC
          if (parallelPos >= seg.start && parallelPos <= seg.end) {
            minDt = dt
            bestCushion = DIRECTION_TO_CUSHION[seg.direction]
          }
        }
      }
    }

    // Direct contact checks (same as QuadraticCushionDetector but segment-aware)
    const WALL_TOL = 0.01
    const VEL_TOL = 0.01
    const INSTANT_DT = 1e-12

    for (const seg of this.segments) {
      if (seg.axis === 'y') {
        const parallelPos = traj.c[0] // current x position
        if (parallelPos < seg.start || parallelPos > seg.end) continue

        if (seg.direction === 'north' && traj.c[1] > tableHeight - r - WALL_TOL && traj.b[1] > VEL_TOL && INSTANT_DT < minDt) {
          minDt = INSTANT_DT
          bestCushion = Cushion.North
        }
        if (seg.direction === 'south' && traj.c[1] < r + WALL_TOL && traj.b[1] < -VEL_TOL && INSTANT_DT < minDt) {
          minDt = INSTANT_DT
          bestCushion = Cushion.South
        }
      } else {
        const parallelPos = traj.c[1] // current y position
        if (parallelPos < seg.start || parallelPos > seg.end) continue

        if (seg.direction === 'east' && traj.c[0] > tableWidth - r - WALL_TOL && traj.b[0] > VEL_TOL && INSTANT_DT < minDt) {
          minDt = INSTANT_DT
          bestCushion = Cushion.East
        }
        if (seg.direction === 'west' && traj.c[0] < r + WALL_TOL && traj.b[0] < -VEL_TOL && INSTANT_DT < minDt) {
          minDt = INSTANT_DT
          bestCushion = Cushion.West
        }
      }
    }

    return {
      type: 'Cushion',
      circles: [circle],
      cushion: bestCushion,
      time: minDt + circle.time,
      epochs: [circle.epoch],
      seq: 0,
    }
  }
}
