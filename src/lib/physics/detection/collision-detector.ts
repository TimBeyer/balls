/**
 * Interfaces for collision detection.
 *
 * CollisionDetectors compute WHEN collisions happen by solving polynomial
 * equations on ball trajectories. They don't resolve collisions — they just
 * find the time.
 *
 * Implementations:
 * - QuarticBallBallDetector: solves quartic for two quadratic trajectories
 * - QuadraticCushionDetector: solves quadratic for ball vs axis-aligned wall
 */

import type Ball from '../../ball'
import type { CushionCollision } from '../../collision'

export interface BallBallDetector {
  /** Compute the earliest collision time between two balls, or undefined if none. */
  detect(ballA: Ball, ballB: Ball): number | undefined
}

export interface CushionDetector {
  /** Compute the earliest cushion collision for a ball. Always returns an event (may be at Infinity). */
  detect(ball: Ball, tableWidth: number, tableHeight: number): CushionCollision
}
