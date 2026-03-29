/**
 * Pocket collision detector.
 *
 * Detects when a ball's center enters a pocket's acceptance circle.
 * With quadratic ball trajectories r(t) = a*t^2 + b*t + c, the squared
 * distance from the pocket center is a quartic polynomial. We find the
 * first time it drops below pocket_radius^2 using the same cubic-critical-point
 * + bisection approach as the ball-ball detector.
 */

import type Ball from '../../ball'
import type { PocketDef } from '../../table-config'
import { solveCubic } from '../../polynomial-solver'

export interface PocketCollisionResult {
  pocketId: string
  /** Absolute time when the ball enters the pocket */
  time: number
}

export interface PocketDetector {
  /** Detect the earliest pocket entry for a ball, or undefined if none within trajectory validity. */
  detect(ball: Ball, pockets: PocketDef[]): PocketCollisionResult | undefined
}

export class QuarticPocketDetector implements PocketDetector {
  detect(ball: Ball, pockets: PocketDef[]): PocketCollisionResult | undefined {
    let bestTime: number | undefined
    let bestPocketId: string | undefined

    for (const pocket of pockets) {
      const time = this.detectSinglePocket(ball, pocket)
      if (time !== undefined && (bestTime === undefined || time < bestTime)) {
        bestTime = time
        bestPocketId = pocket.id
      }
    }

    if (bestTime !== undefined && bestPocketId !== undefined) {
      return { pocketId: bestPocketId, time: bestTime }
    }
    return undefined
  }

  private detectSinglePocket(ball: Ball, pocket: PocketDef): number | undefined {
    const traj = ball.trajectory
    const maxDt = traj.maxDt

    // Difference vector from pocket center: d(t) = r(t) - pocketCenter
    // d(t) = A*t^2 + B*t + C where:
    const Ax = traj.a[0]
    const Ay = traj.a[1]
    const Bx = traj.b[0]
    const By = traj.b[1]
    const Cx = traj.c[0] - pocket.center[0]
    const Cy = traj.c[1] - pocket.center[1]

    const rSq = pocket.radius * pocket.radius

    // D(t) = |d(t)|^2 - rSq is a quartic polynomial
    // D(t) = c4*t^4 + c3*t^3 + c2*t^2 + c1*t + c0
    const c4 = Ax * Ax + Ay * Ay
    const c3 = 2 * (Ax * Bx + Ay * By)
    const c2 = Bx * Bx + By * By + 2 * (Ax * Cx + Ay * Cy)
    const c1 = 2 * (Bx * Cx + By * Cy)
    const c0 = Cx * Cx + Cy * Cy - rSq

    // Already inside pocket
    if (c0 <= 0) {
      return ball.time
    }

    // D'(t) = 4*c4*t^3 + 3*c3*t^2 + 2*c2*t + c1
    const criticalPoints = solveCubic(4 * c4, 3 * c3, 2 * c2, c1)

    // Evaluate D at critical points and endpoints to find sign change
    const D = (t: number): number => {
      const t2 = t * t
      return c4 * t2 * t2 + c3 * t2 * t + c2 * t2 + c1 * t + c0
    }

    const evalPoints: number[] = [0]
    for (const cp of criticalPoints) {
      if (cp > 1e-12 && (isFinite(maxDt) ? cp < maxDt : true)) {
        evalPoints.push(cp)
      }
    }
    if (isFinite(maxDt)) {
      evalPoints.push(maxDt)
    }
    evalPoints.sort((a, b) => a - b)

    // Find first interval where D transitions from >=0 to <0
    let bracketLo: number | undefined
    let bracketHi: number | undefined
    let prevD = c0

    for (let i = 1; i < evalPoints.length; i++) {
      const t = evalPoints[i]
      const Dt = D(t)
      if (prevD >= 0 && Dt < 0) {
        bracketLo = evalPoints[i - 1]
        bracketHi = t
        break
      }
      prevD = Dt
    }

    // Check midpoints if no sign change at evaluation points
    if (bracketLo === undefined || bracketHi === undefined) {
      prevD = c0
      for (let i = 1; i < evalPoints.length; i++) {
        const t = evalPoints[i]
        const Dt = D(t)
        const mid = (evalPoints[i - 1] + t) / 2
        const Dmid = D(mid)
        if ((prevD >= 0 || Dt >= 0) && Dmid < 0) {
          if (prevD >= 0 && Dmid < 0) {
            bracketLo = evalPoints[i - 1]
            bracketHi = mid
          } else {
            bracketLo = mid
            bracketHi = t
          }
          break
        }
        prevD = Dt
      }
    }

    if (bracketLo === undefined || bracketHi === undefined) {
      return undefined
    }

    // Bisect to find exact crossing (40 iterations ≈ 12 digits precision)
    let lo = bracketLo
    let hi = bracketHi
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (D(mid) > 0) lo = mid
      else hi = mid
    }

    const dt = (lo + hi) / 2
    if (dt < 1e-12) return undefined

    return dt + ball.time
  }
}
