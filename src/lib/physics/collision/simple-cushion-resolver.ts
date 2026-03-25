/**
 * Simple cushion collision resolver — just reflects velocity.
 * No spin transfer, no Han 2005 model. Used by the Simple2D physics profile.
 */

import type Ball from '../../ball'
import { Cushion } from '../../collision'
import type { PhysicsConfig } from '../../physics-config'
import type { CushionCollisionResolver } from './collision-resolver'

export class SimpleCushionResolver implements CushionCollisionResolver {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolve(ball: Ball, cushion: Cushion, tableWidth: number, tableHeight: number, _config: PhysicsConfig): void {
    const e = ball.physicsParams.eRestitution

    switch (cushion) {
      case Cushion.North:
        ball.velocity[1] = -Math.abs(ball.velocity[1]) * e
        ball.position[1] = tableHeight - ball.radius
        break
      case Cushion.South:
        ball.velocity[1] = Math.abs(ball.velocity[1]) * e
        ball.position[1] = ball.radius
        break
      case Cushion.East:
        ball.velocity[0] = -Math.abs(ball.velocity[0]) * e
        ball.position[0] = tableWidth - ball.radius
        break
      case Cushion.West:
        ball.velocity[0] = Math.abs(ball.velocity[0]) * e
        ball.position[0] = ball.radius
        break
    }
    ball.velocity[2] = 0
  }

  /** No trajectory clamping needed for simple reflection */
  clampTrajectory(): void {
    // no-op
  }
}
