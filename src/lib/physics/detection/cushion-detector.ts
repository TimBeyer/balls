/**
 * Quadratic cushion collision detector.
 *
 * For axis-aligned cushions with quadratic ball trajectories,
 * solve: a*t^2 + b*t + (c - wall) = 0
 */

import type Ball from '../../ball'
import { Cushion, type CushionCollision } from '../../collision'
import { solveQuadratic } from '../../polynomial-solver'
import type { CushionDetector } from './collision-detector'

const CUSHIONS = [Cushion.North, Cushion.East, Cushion.South, Cushion.West] as const

export class QuadraticCushionDetector implements CushionDetector {
  detect(circle: Ball, tableWidth: number, tableHeight: number): CushionCollision {
    const traj = circle.trajectory
    const r = circle.radius

    let minDt = Infinity
    let bestIdx = 0

    // North wall: y = tableHeight - r
    const northRoots = solveQuadratic(traj.a[1], traj.b[1], traj.c[1] - (tableHeight - r))
    for (const dt of northRoots) {
      if (dt > Number.EPSILON && dt < minDt) {
        minDt = dt
        bestIdx = 0
      }
    }

    // East wall: x = tableWidth - r
    const eastRoots = solveQuadratic(traj.a[0], traj.b[0], traj.c[0] - (tableWidth - r))
    for (const dt of eastRoots) {
      if (dt > Number.EPSILON && dt < minDt) {
        minDt = dt
        bestIdx = 1
      }
    }

    // South wall: y = r
    const southRoots = solveQuadratic(traj.a[1], traj.b[1], traj.c[1] - r)
    for (const dt of southRoots) {
      if (dt > Number.EPSILON && dt < minDt) {
        minDt = dt
        bestIdx = 2
      }
    }

    // West wall: x = r
    const westRoots = solveQuadratic(traj.a[0], traj.b[0], traj.c[0] - r)
    for (const dt of westRoots) {
      if (dt > Number.EPSILON && dt < minDt) {
        minDt = dt
        bestIdx = 3
      }
    }

    return {
      type: 'Cushion',
      circles: [circle],
      cushion: CUSHIONS[bestIdx],
      time: minDt + circle.time,
      epochs: [circle.epoch],
      seq: 0,
    }
  }
}
