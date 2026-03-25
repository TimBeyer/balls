/**
 * Elastic ball-ball collision resolver.
 *
 * Standard 2D elastic collision with mass support.
 * Angular velocity is preserved unchanged through ball-ball collisions
 * (elastic, frictionless, instantaneous model — no spin transfer).
 * After collision, updateTrajectory() re-determines the motion state;
 * the ball will typically enter Sliding and friction naturally evolves it to Rolling.
 */

import type Ball from '../../ball'
import type { PhysicsConfig } from '../../physics-config'
import type { BallCollisionResolver } from './collision-resolver'

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

    // 1D elastic collision along the normal
    const commonVelocity = (2 * (c1.mass * v1dot + c2.mass * v2dot)) / (c1.mass + c2.mass)
    const v1NormalAfter = commonVelocity - v1dot
    const v2NormalAfter = commonVelocity - v2dot

    // Reconstruct 2D velocity: normal component + tangential remainder
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
