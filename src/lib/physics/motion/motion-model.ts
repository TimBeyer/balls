/**
 * Interface for motion state models.
 *
 * Each MotionModel encapsulates ALL physics logic for a single motion state:
 * - How the ball moves (trajectory coefficients)
 * - How angular velocity evolves
 * - When the state ends (transition timing)
 * - What to enforce on transition (velocity/spin zeroing, constraints)
 *
 * This unifies logic that was previously scattered across trajectory.ts,
 * state-transitions.ts, and simulation.ts.
 */

import type Ball from '../../ball'
import type { PhysicsConfig } from '../../physics-config'
import type { TrajectoryCoeffs, AngularVelCoeffs } from '../../trajectory'
import type { MotionState } from '../../motion-state'

export interface StateTransition {
  /** Time delta from ball's current time until transition */
  dt: number
  /** Target motion state after transition */
  toState: MotionState
}

export interface MotionModel {
  /** Which motion state this model handles */
  readonly state: MotionState

  /** Compute position trajectory r(t) = a*t^2 + b*t + c */
  computeTrajectory(ball: Ball, config: PhysicsConfig): TrajectoryCoeffs

  /** Compute angular velocity trajectory omega(t) = alpha*t + omega0 */
  computeAngularTrajectory(ball: Ball, config: PhysicsConfig): AngularVelCoeffs

  /** Time until this state ends, and what state follows. undefined = no transition. */
  getTransitionTime(ball: Ball, config: PhysicsConfig): StateTransition | undefined

  /** Apply the state transition: zero velocity, enforce constraints, etc. */
  applyTransition(ball: Ball, toState: MotionState): void
}
