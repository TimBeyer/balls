import type Ball from '../../ball'
import type { PhysicsConfig } from '../../physics-config'
import type { TrajectoryCoeffs, AngularVelCoeffs } from '../../trajectory'
import { MotionState } from '../../motion-state'
import { vec3Zero } from '../../vector3d'
import type { MotionModel, StateTransition } from './motion-model'

export class SpinningMotion implements MotionModel {
  readonly state = MotionState.Spinning

  computeTrajectory(ball: Ball): TrajectoryCoeffs {
    return {
      a: vec3Zero(),
      b: vec3Zero(),
      c: [ball.position[0], ball.position[1], ball.position[2]],
      maxDt: Infinity,
    }
  }

  computeAngularTrajectory(ball: Ball, config: PhysicsConfig): AngularVelCoeffs {
    const params = ball.physicsParams
    const R = params.radius
    const spinDecel = (5 * params.muSpinning * config.gravity) / (2 * R)
    const omegaZSign = ball.angularVelocity[2] > 0 ? 1 : ball.angularVelocity[2] < 0 ? -1 : 0

    return {
      alpha: [0, 0, -spinDecel * omegaZSign],
      omega0: [ball.angularVelocity[0], ball.angularVelocity[1], ball.angularVelocity[2]],
    }
  }

  getTransitionTime(ball: Ball, config: PhysicsConfig): StateTransition | undefined {
    const params = ball.physicsParams
    const absOmegaZ = Math.abs(ball.angularVelocity[2])
    if (absOmegaZ < 1e-9) return undefined
    if (params.muSpinning < 1e-12) return undefined

    const dt = (2 * params.radius * absOmegaZ) / (5 * params.muSpinning * config.gravity)
    return { dt, toState: MotionState.Stationary }
  }

  applyTransition(ball: Ball): void {
    // Spinning → Stationary: zero everything
    ball.velocity = [0, 0, 0]
    // Keep angular velocity z-component, zero xy
    ball.angularVelocity[0] = 0
    ball.angularVelocity[1] = 0
  }
}
