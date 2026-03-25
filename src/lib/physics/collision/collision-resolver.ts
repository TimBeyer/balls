/**
 * Interface for collision resolvers.
 *
 * A CollisionResolver handles the physics of WHAT HAPPENS when a collision fires:
 * updating velocities, angular velocities, positions, and any post-collision effects
 * (boundary snapping, trajectory clamping, rolling constraint enforcement).
 *
 * Implementations:
 * - ElasticBallResolver: standard elastic ball-ball collision
 * - Han2005CushionResolver: Han 2005 model with spin transfer
 * - SimpleCushionResolver: simple velocity reflection (no spin)
 */

import type Ball from '../../ball'
import type { Cushion } from '../../collision'
import type { PhysicsConfig } from '../../physics-config'

export interface BallCollisionResolver {
  /** Resolve a ball-ball collision. Mutates both balls' velocity and angular velocity. */
  resolve(ball1: Ball, ball2: Ball, config: PhysicsConfig): void
}

export interface CushionCollisionResolver {
  /**
   * Resolve a cushion collision. Mutates ball velocity, angular velocity, and position.
   * Includes any post-collision effects (snapping).
   */
  resolve(ball: Ball, cushion: Cushion, tableWidth: number, tableHeight: number, config: PhysicsConfig): void

  /**
   * Optional: clamp trajectory acceleration after updateTrajectory() to prevent
   * spin-induced friction from pushing ball back through wall.
   * Called AFTER ball.updateTrajectory().
   */
  clampTrajectory(ball: Ball, cushion: Cushion): void
}
