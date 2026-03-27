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

    // Direct contact checks: when clampToBounds places a ball exactly at a wall
    // boundary, the quadratic equation has a root at t=0 which is filtered by the
    // epsilon threshold above. Detect "ball at wall with velocity into wall" explicitly.
    const WALL_TOL = 0.01 // mm
    const VEL_TOL = 0.01 // mm/s
    const INSTANT_DT = 1e-12

    if (traj.c[1] > tableHeight - r - WALL_TOL && traj.b[1] > VEL_TOL && INSTANT_DT < minDt) {
      minDt = INSTANT_DT
      bestIdx = 0 // North
    }
    if (traj.c[0] > tableWidth - r - WALL_TOL && traj.b[0] > VEL_TOL && INSTANT_DT < minDt) {
      minDt = INSTANT_DT
      bestIdx = 1 // East
    }
    if (traj.c[1] < r + WALL_TOL && traj.b[1] < -VEL_TOL && INSTANT_DT < minDt) {
      minDt = INSTANT_DT
      bestIdx = 2 // South
    }
    if (traj.c[0] < r + WALL_TOL && traj.b[0] < -VEL_TOL && INSTANT_DT < minDt) {
      minDt = INSTANT_DT
      bestIdx = 3 // West
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
