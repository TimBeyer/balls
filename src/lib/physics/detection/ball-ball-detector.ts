/**
 * Ball-ball collision detector using cubic-minimum + bisection.
 *
 * With quadratic trajectories r_i(t) = a_i*t² + b_i*t + c_i,
 * the distance-squared function D(t) = |d(t)|² - rSum² is a quartic polynomial.
 * Instead of solving D(t) = 0 algebraically (Ferrari — numerically fragile),
 * we find critical points of D(t) by solving D'(t) = 0 (a cubic, solved stably
 * by Cardano's method), then bracket and bisect the first zero crossing.
 *
 * Both balls' trajectories are re-referenced to a common time (the later of the two).
 * The search is clamped to the minimum validity horizon of both trajectories.
 */

import type Ball from '../../ball'
import { solveCubic } from '../../polynomial-solver'
import type { BallBallDetector } from './collision-detector'

/** Rebase trajectory coefficients to a new origin time offset by dt */
function rebaseTrajectory(
  traj: { a: [number, number, number]; b: [number, number, number]; c: [number, number, number] },
  dt: number,
) {
  if (dt === 0) {
    return {
      a0: traj.a[0], a1: traj.a[1], a2: traj.a[2],
      b0: traj.b[0], b1: traj.b[1], b2: traj.b[2],
      c0: traj.c[0], c1: traj.c[1], c2: traj.c[2],
    }
  }
  const dt2 = dt * dt
  return {
    a0: traj.a[0], a1: traj.a[1], a2: traj.a[2],
    b0: 2 * traj.a[0] * dt + traj.b[0],
    b1: 2 * traj.a[1] * dt + traj.b[1],
    b2: 2 * traj.a[2] * dt + traj.b[2],
    c0: traj.a[0] * dt2 + traj.b[0] * dt + traj.c[0],
    c1: traj.a[1] * dt2 + traj.b[1] * dt + traj.c[1],
    c2: traj.a[2] * dt2 + traj.b[2] * dt + traj.c[2],
  }
}

export class QuarticBallBallDetector implements BallBallDetector {
  detect(circleA: Ball, circleB: Ball): number | undefined {
    const refTime = Math.max(circleA.time, circleB.time)
    const dtA = refTime - circleA.time
    const dtB = refTime - circleB.time

    const rebaseA = rebaseTrajectory(circleA.trajectory, dtA)
    const rebaseB = rebaseTrajectory(circleB.trajectory, dtB)

    // Difference: d(t) = B(t) - A(t) = A*t² + B*t + C
    const Ax = rebaseB.a0 - rebaseA.a0
    const Ay = rebaseB.a1 - rebaseA.a1
    const Az = rebaseB.a2 - rebaseA.a2
    const Bx = rebaseB.b0 - rebaseA.b0
    const By = rebaseB.b1 - rebaseA.b1
    const Bz = rebaseB.b2 - rebaseA.b2
    const Cx = rebaseB.c0 - rebaseA.c0
    const Cy = rebaseB.c1 - rebaseA.c1
    const Cz = rebaseB.c2 - rebaseA.c2

    const rSum = circleA.radius + circleB.radius
    const rSumSq = rSum * rSum

    // D(t) = |d(t)|² - rSum²  is the signed distance function.
    // D(t) = c4*t⁴ + c3*t³ + c2*t² + c1*t + c0
    const c4 = Ax * Ax + Ay * Ay + Az * Az
    const c3 = 2 * (Ax * Bx + Ay * By + Az * Bz)
    const c2 = Bx * Bx + By * By + Bz * Bz + 2 * (Ax * Cx + Ay * Cy + Az * Cz)
    const c1 = 2 * (Bx * Cx + By * Cy + Bz * Cz)
    const c0 = Cx * Cx + Cy * Cy + Cz * Cz - rSumSq

    // Clamp search to trajectory validity horizons
    const maxDtA = circleA.trajectory.maxDt - dtA
    const maxDtB = circleB.trajectory.maxDt - dtB
    const maxValidDt = Math.min(maxDtA, maxDtB)
    if (maxValidDt <= 0) return undefined

    // Evaluate D(t) directly
    const D = (t: number): number => {
      const t2 = t * t
      return c4 * t2 * t2 + c3 * t2 * t + c2 * t2 + c1 * t + c0
    }

    const D0 = c0 // D(0)

    // Already overlapping or touching: D(0) ≤ 0 means dist ≤ rSum.
    // Check if approaching (D'(0) < 0) — schedule immediate collision.
    // If separating (D'(0) ≥ 0) — they'll resolve themselves, skip.
    //
    // Use a scaled tolerance for "approaching": when D0 is near zero
    // (balls just touching after snap-apart), floating-point noise in
    // positions and velocities can make c1 barely negative, causing an
    // infinite re-collision loop. Require c1 to be meaningfully negative
    // relative to rSumSq (which scales with ball size).
    if (D0 <= 0) {
      const approachTol = -1e-7 * rSumSq
      if (c1 >= approachTol) return undefined // Separating, stationary, or noise
      return refTime + 1e-12 // Genuinely approaching — instant collision
    }

    // D'(t) = 4*c4*t³ + 3*c3*t² + 2*c2*t + c1 (cubic)
    // Find critical points to identify intervals where D crosses zero.

    // Collect evaluation points: t=0, critical points in (0, maxValidDt), and t=maxValidDt (if finite)
    const criticalPoints = solveCubic(4 * c4, 3 * c3, 2 * c2, c1)
    const evalPoints: number[] = [0]
    for (const cp of criticalPoints) {
      if (cp > 1e-12 && (isFinite(maxValidDt) ? cp < maxValidDt : true)) {
        evalPoints.push(cp)
      }
    }
    if (isFinite(maxValidDt)) {
      evalPoints.push(maxValidDt)
    }
    evalPoints.sort((a, b) => a - b)

    // Find the first interval where D transitions from ≥0 to <0 (collision entry)
    let bracketLo: number | undefined
    let bracketHi: number | undefined
    let prevD = D0
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

    if (bracketLo === undefined || bracketHi === undefined) {
      // No sign change at evaluation points. Check midpoints between consecutive eval points
      // — D could dip below zero between critical points if the quartic wiggles.
      prevD = D0
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

    // Bisect [bracketLo, bracketHi] to find the exact zero crossing (40 iterations ≈ 12 digits)
    let lo = bracketLo
    let hi = bracketHi
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (D(mid) > 0) lo = mid
      else hi = mid
    }

    const dt = (lo + hi) / 2
    if (dt < 1e-12) return undefined // Too close to current time

    return dt + refTime
  }
}
