/**
 * Quartic polynomial ball-ball collision detector.
 *
 * With quadratic trajectories r_i(t) = a_i*t^2 + b_i*t + c_i,
 * the distance vector d(t) = r_j(t) - r_i(t) = A*t^2 + B*t + C.
 * Collision when |d(t)|^2 = (R_i + R_j)^2 yields a quartic polynomial.
 *
 * Both balls' trajectories are re-referenced to a common time (the later of the two).
 */

import type Ball from '../../ball'
import { smallestPositiveRoot } from '../../polynomial-solver'
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

    // Difference: d(t) = B(t) - A(t)
    const Ax = rebaseB.a0 - rebaseA.a0
    const Ay = rebaseB.a1 - rebaseA.a1
    const Az = rebaseB.a2 - rebaseA.a2
    const Bx = rebaseB.b0 - rebaseA.b0
    const By = rebaseB.b1 - rebaseA.b1
    const Bz = rebaseB.b2 - rebaseA.b2
    const Cx = rebaseB.c0 - rebaseA.c0
    const Cy = rebaseB.c1 - rebaseA.c1
    const Cz = rebaseB.c2 - rebaseA.c2

    // Overlap guard — handle genuinely overlapping balls (> 0.5mm overlap)
    // directly without the quartic solver.
    // Smaller overlaps (float noise from snap-apart, up to ~0.5mm) fall through
    // to the quartic, which correctly finds future collisions (e.g., when a
    // decelerating ball reverses direction after a missed state transition).
    const distSq = Cx * Cx + Cy * Cy + Cz * Cz
    const rSum = circleA.radius + circleB.radius
    const guardDist = rSum - 0.5
    if (distSq < guardDist * guardDist) {
      // Genuine overlap (> 0.5mm). Check whether approaching or separating.
      // d(|d|²)/dt at t=0 = 2*(C·B). Negative means distance is shrinking.
      const dDistSqDt = 2 * (Cx * Bx + Cy * By + Cz * Bz)
      if (dDistSqDt >= 0) return undefined // Separating — will self-resolve

      // Approaching while overlapping — schedule near-immediate collision
      return refTime + 1e-12
    }

    // Quartic coefficients for |d(t)|² = rSum²
    const coeff4 = Ax * Ax + Ay * Ay + Az * Az
    const coeff3 = 2 * (Ax * Bx + Ay * By + Az * Bz)
    const coeff2 = Bx * Bx + By * By + Bz * Bz + 2 * (Ax * Cx + Ay * Cy + Az * Cz)
    const coeff1 = 2 * (Bx * Cx + By * Cy + Bz * Cz)
    const coeff0 = distSq - rSum * rSum

    // When balls are at near-contact distance (coeff0 ≈ 0), the quartic has a
    // spurious near-zero root at the current contact point. Skip it by raising
    // the minimum root threshold so the solver finds the actual NEXT collision
    // (e.g., a decelerating ball that reverses direction toward its neighbor).
    const nearContact = Math.abs(coeff0) < rSum * 0.5
    const minRootDt = nearContact ? 1e-6 : undefined

    let dt = smallestPositiveRoot([coeff4, coeff3, coeff2, coeff1, coeff0], minRootDt)
    if (dt === undefined) return undefined

    // Verify the root produces a collision using the exact distance function.
    // Ferrari's method can produce spurious roots when coefficients are ill-conditioned
    // (common with large sliding friction accelerations near contact distance).
    const rSumSq = rSum * rSum
    const verifyDistSq = (t: number): number => {
      const t2 = t * t
      const ex = Ax * t2 + Bx * t + Cx
      const ey = Ay * t2 + By * t + Cy
      const ez = Az * t2 + Bz * t + Cz
      return ex * ex + ey * ey + ez * ez
    }

    if (verifyDistSq(dt) > rSumSq * 1.02) {
      // Root failed verification — Ferrari's method produced a spurious root
      // (common when coefficients are ill-conditioned near contact distance).
      // Use bisection on the exact distance function as a robust fallback.
      // Scan at 5ms intervals up to 0.5s to find a bracket where distSq crosses rSumSq,
      // then bisect to find the precise collision time.
      const SCAN_STEP = 0.005
      const SCAN_MAX = 0.5
      let lo: number | undefined
      let prevDistSq = distSq
      for (let t = SCAN_STEP; t <= SCAN_MAX; t += SCAN_STEP) {
        const curDistSq = verifyDistSq(t)
        if (prevDistSq >= rSumSq && curDistSq < rSumSq) {
          lo = t - SCAN_STEP
          break
        }
        prevDistSq = curDistSq
      }
      if (lo !== undefined) {
        // Bisect within [lo, lo + SCAN_STEP]
        let a = lo
        let b = lo + SCAN_STEP
        for (let i = 0; i < 40; i++) {
          const mid = (a + b) / 2
          if (verifyDistSq(mid) > rSumSq) a = mid
          else b = mid
        }
        dt = (a + b) / 2
      } else {
        return undefined
      }
    }

    return dt + refTime
  }
}
