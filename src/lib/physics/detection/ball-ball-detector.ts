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

    // Overlap guard
    const distSq = Cx * Cx + Cy * Cy + Cz * Cz
    const rSum = circleA.radius + circleB.radius
    if (distSq < rSum * rSum) return undefined

    // Quartic coefficients
    const coeff4 = Ax * Ax + Ay * Ay + Az * Az
    const coeff3 = 2 * (Ax * Bx + Ay * By + Az * Bz)
    const coeff2 = Bx * Bx + By * By + Bz * Bz + 2 * (Ax * Cx + Ay * Cy + Az * Cz)
    const coeff1 = 2 * (Bx * Cx + By * Cy + Bz * Cz)
    const coeff0 = Cx * Cx + Cy * Cy + Cz * Cz - rSum * rSum

    const dt = smallestPositiveRoot([coeff4, coeff3, coeff2, coeff1, coeff0])
    if (dt === undefined) return undefined

    return dt + refTime
  }
}
