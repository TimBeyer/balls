/**
 * Airborne motion model — ball is in the air (e.g., after a cushion bounce).
 *
 * No friction in x/y (no table contact). Gravity in z.
 * Angular velocity is constant (no torques while airborne).
 * Transitions back to a surface state when z reaches 0 (ball lands).
 */

import type Ball from '../../ball'
import type { PhysicsConfig } from '../../physics-config'
import type { TrajectoryCoeffs, AngularVelCoeffs } from '../../trajectory'
import { MotionState } from '../../motion-state'
import { vec3Zero } from '../../vector3d'
import type { MotionModel, StateTransition } from './motion-model'

export class AirborneMotion implements MotionModel {
  readonly state = MotionState.Airborne

  computeTrajectory(ball: Ball, config: PhysicsConfig): TrajectoryCoeffs {
    // No friction in x/y while airborne. Gravity pulls z down.
    return {
      a: [0, 0, -config.gravity / 2],
      b: [ball.velocity[0], ball.velocity[1], ball.velocity[2]],
      c: [ball.position[0], ball.position[1], ball.position[2]],
    }
  }

  computeAngularTrajectory(ball: Ball): AngularVelCoeffs {
    // No torques in air — angular velocity is constant
    return {
      alpha: vec3Zero(),
      omega0: [ball.angularVelocity[0], ball.angularVelocity[1], ball.angularVelocity[2]],
    }
  }

  getTransitionTime(ball: Ball, config: PhysicsConfig): StateTransition | undefined {
    // Solve z(t) = 0: position[2] + velocity[2]*t - (g/2)*t² = 0
    const z0 = ball.position[2]
    const vz = ball.velocity[2]
    const g = config.gravity

    // Quadratic: -(g/2)*t² + vz*t + z0 = 0 → (g/2)*t² - vz*t - z0 = 0
    const a = g / 2
    const b = -vz
    const c = -z0

    const discriminant = b * b - 4 * a * c
    if (discriminant < 0) return undefined

    const sqrtDisc = Math.sqrt(discriminant)
    // We want the smallest positive root
    const t1 = (-b - sqrtDisc) / (2 * a)
    const t2 = (-b + sqrtDisc) / (2 * a)

    let dt: number | undefined
    if (t1 > 1e-9) dt = t1
    else if (t2 > 1e-9) dt = t2
    else return undefined

    // The ball lands — transition to a surface state (determined after landing)
    // We use Sliding as the default target; applyTransition will refine
    return { dt, toState: MotionState.Sliding }
  }

  applyTransition(ball: Ball, _toState: MotionState, config?: PhysicsConfig): void {
    // Ball lands on the table. Apply table restitution to v_z.
    const eTable = config?.eTableRestitution ?? 0.5
    const vz = ball.velocity[2]

    // Ball is falling (vz should be negative at landing). Bounce it.
    const vzBounce = -vz * eTable

    // Set z-position to 0 (on table surface)
    ball.position[2] = 0

    if (vzBounce > 10) {
      // Still enough vertical velocity — stay airborne for another bounce
      ball.velocity[2] = vzBounce
    } else {
      // Settled on the table — zero z-velocity
      ball.velocity[2] = 0
    }
  }
}
