/**
 * Ball-ball collision resolver with progressive restitution.
 *
 * Uses the standard impulse-based collision formula with a coefficient of
 * restitution `e` that varies smoothly with approach speed:
 *
 *   e(v) = clamp((|v_approach| - V_LOW) / (V_HIGH - V_LOW), 0, 1)
 *
 * - Below V_LOW (5 mm/s): perfectly inelastic (e=0), both balls get COM velocity
 * - Above V_HIGH (50 mm/s): perfectly elastic (e=1), standard momentum exchange
 * - Between: linear ramp — absorbs energy progressively as balls settle
 *
 * This prevents Zeno cascades in low-energy clusters. A ball approaching at 30 mm/s
 * loses ~45% of its normal velocity, settles in ~3 bounces instead of ~20+.
 *
 * Angular velocity is preserved unchanged (elastic, frictionless, instantaneous model).
 */

import type Ball from '../../ball'
import type { PhysicsConfig } from '../../physics-config'
import type { BallCollisionResolver } from './collision-resolver'

/** Approach speed (mm/s) below which e=0 (perfectly inelastic) */
const V_LOW = 5
/** Approach speed (mm/s) above which e=1 (perfectly elastic) */
const V_HIGH = 50

export class ElasticBallResolver implements BallCollisionResolver {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolve(c1: Ball, c2: Ball, _config: PhysicsConfig): void {
    const [vx1, vy1] = c1.velocity
    const [vx2, vy2] = c2.velocity

    const [x1, y1] = c1.position
    const [x2, y2] = c2.position
    let dx = x1 - x2,
      dy = y1 - y2

    const dist = Math.sqrt(dx * dx + dy * dy)
    dx = dx / dist
    dy = dy / dist

    // Project velocities onto collision normal
    const v1dot = dx * vx1 + dy * vy1
    const v2dot = dx * vx2 + dy * vy2

    // Tangential remainders (perpendicular to collision normal, unchanged)
    const vx1Remainder = vx1 - dx * v1dot,
      vy1Remainder = vy1 - dy * v1dot
    const vx2Remainder = vx2 - dx * v2dot,
      vy2Remainder = vy2 - dy * v2dot

    // Progressive coefficient of restitution: ramps linearly from 0 to 1
    const absApproach = Math.abs(v1dot - v2dot)
    const e = Math.min(1, Math.max(0, (absApproach - V_LOW) / (V_HIGH - V_LOW)))

    // Standard restitution formula:
    //   v1_after = ((m1 - e*m2)*v1n + (1+e)*m2*v2n) / (m1+m2)
    //   v2_after = ((m2 - e*m1)*v2n + (1+e)*m1*v1n) / (m1+m2)
    // When e=1: elastic. When e=0: both get COM velocity.
    const totalMass = c1.mass + c2.mass
    const v1NormalAfter = ((c1.mass - e * c2.mass) * v1dot + (1 + e) * c2.mass * v2dot) / totalMass
    const v2NormalAfter = ((c2.mass - e * c1.mass) * v2dot + (1 + e) * c1.mass * v1dot) / totalMass

    c1.velocity[0] = dx * v1NormalAfter + vx1Remainder
    c1.velocity[1] = dy * v1NormalAfter + vy1Remainder
    c2.velocity[0] = dx * v2NormalAfter + vx2Remainder
    c2.velocity[1] = dy * v2NormalAfter + vy2Remainder

    // Zero z-velocity (we only use z for airborne balls, not ball-ball collisions)
    c1.velocity[2] = 0
    c2.velocity[2] = 0

    // Angular velocity is preserved unchanged — no spin transfer in this model.
    // The ball's motion state will be re-determined by updateTrajectory() after this.
  }
}
