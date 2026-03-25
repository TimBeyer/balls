/**
 * Analytical computation of state transition times.
 *
 * Each ball in a given motion state will eventually transition to another state:
 * - Sliding → Rolling (relative velocity reaches zero)
 * - Rolling → Stationary or Spinning (center-of-mass velocity reaches zero)
 * - Spinning → Stationary (angular velocity z-component reaches zero)
 * - Stationary → (no transition)
 */

import type Ball from './ball'
import { MotionState } from './motion-state'
import type { PhysicsConfig } from './physics-config'
import { computeRelativeVelocity } from './trajectory'
import { vec3Magnitude2D } from './vector3d'

export interface StateTransitionEvent {
  type: 'StateTransition'
  time: number
  circles: [Ball]
  fromState: MotionState
  toState: MotionState
  epochs: [number]
  seq: number
}

/**
 * Compute the time of the next state transition for a ball, if any.
 * Returns the event with absolute time, or undefined if the ball is stationary.
 */
export function getStateTransitionTime(ball: Ball, config: PhysicsConfig): Omit<StateTransitionEvent, 'seq'> | undefined {
  const params = ball.physicsParams
  const g = config.gravity
  const R = params.radius

  switch (ball.motionState) {
    case MotionState.Stationary:
      return undefined

    case MotionState.Spinning: {
      const absOmegaZ = Math.abs(ball.angularVelocity[2])
      if (absOmegaZ < 1e-9) return undefined
      if (params.muSpinning < 1e-12) return undefined // no friction → never stops

      // Time for omega_z to reach zero: dt = 2R * |omega_z| / (5 * mu_sp * g)
      const dt = (2 * R * absOmegaZ) / (5 * params.muSpinning * g)
      return {
        type: 'StateTransition',
        time: ball.time + dt,
        circles: [ball],
        fromState: MotionState.Spinning,
        toState: MotionState.Stationary,
        epochs: [ball.epoch],
      }
    }

    case MotionState.Rolling: {
      const speed = vec3Magnitude2D(ball.velocity)
      if (speed < 1e-9) return undefined
      if (params.muRolling < 1e-12) return undefined // no friction → never stops

      // Time for velocity to reach zero: dt = |v0| / (mu_r * g)
      const dt = speed / (params.muRolling * g)

      // Check if z-spin will still be nonzero at that time
      const spinDecelRate = (5 * params.muSpinning * g) / (2 * R)
      const omegaZAtStop = Math.abs(ball.angularVelocity[2]) - spinDecelRate * dt

      const toState = omegaZAtStop > 1e-9 ? MotionState.Spinning : MotionState.Stationary

      return {
        type: 'StateTransition',
        time: ball.time + dt,
        circles: [ball],
        fromState: MotionState.Rolling,
        toState,
        epochs: [ball.epoch],
      }
    }

    case MotionState.Sliding: {
      // Time for relative velocity to reach zero: dt = (2/7) * |u0| / (mu_s * g)
      const relVel = computeRelativeVelocity(ball.velocity, ball.angularVelocity, R)
      const relSpeed = vec3Magnitude2D(relVel)
      if (relSpeed < 1e-9) return undefined
      if (params.muSliding < 1e-12) return undefined // no friction → never transitions

      const dt = (2 / 7) * (relSpeed / (params.muSliding * g))

      return {
        type: 'StateTransition',
        time: ball.time + dt,
        circles: [ball],
        fromState: MotionState.Sliding,
        toState: MotionState.Rolling,
        epochs: [ball.epoch],
      }
    }
  }
}
