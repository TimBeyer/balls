import type Ball from '../../ball'
import type { PhysicsConfig } from '../../physics-config'
import type { TrajectoryCoeffs, AngularVelCoeffs } from '../../trajectory'
import { MotionState } from '../../motion-state'
import { vec3Zero, vec3Magnitude2D } from '../../vector3d'
import type { MotionModel, StateTransition } from './motion-model'

export class RollingMotion implements MotionModel {
  readonly state = MotionState.Rolling

  computeTrajectory(ball: Ball, config: PhysicsConfig): TrajectoryCoeffs {
    const speed = vec3Magnitude2D(ball.velocity)
    if (speed < 1e-12) {
      return { a: vec3Zero(), b: vec3Zero(), c: [ball.position[0], ball.position[1], ball.position[2]], maxDt: Infinity }
    }

    const params = ball.physicsParams
    const cosPhi = ball.velocity[0] / speed
    const sinPhi = ball.velocity[1] / speed
    const halfMuRG = 0.5 * params.muRolling * config.gravity

    // Rolling stops when speed reaches zero: speed - muR*g*t = 0
    const maxDt = speed / (params.muRolling * config.gravity)

    return {
      a: [-halfMuRG * cosPhi, -halfMuRG * sinPhi, 0],
      b: [ball.velocity[0], ball.velocity[1], ball.velocity[2]],
      c: [ball.position[0], ball.position[1], ball.position[2]],
      maxDt,
    }
  }

  computeAngularTrajectory(ball: Ball, config: PhysicsConfig): AngularVelCoeffs {
    const params = ball.physicsParams
    const R = params.radius
    const g = config.gravity
    const spinDecel = (5 * params.muSpinning * g) / (2 * R)
    const omegaZSign = ball.angularVelocity[2] > 0 ? 1 : ball.angularVelocity[2] < 0 ? -1 : 0

    const speed = vec3Magnitude2D(ball.velocity)
    if (speed < 1e-12) {
      return {
        alpha: [0, 0, -spinDecel * omegaZSign],
        omega0: [ball.angularVelocity[0], ball.angularVelocity[1], ball.angularVelocity[2]],
      }
    }

    const cosPhi = ball.velocity[0] / speed
    const sinPhi = ball.velocity[1] / speed
    // Rolling constraint: omega_x = -v_y/R, omega_y = v_x/R
    // d(omega_x)/dt = -dv_y/dt / R = mu_r*g*sinPhi/R
    // d(omega_y)/dt = dv_x/dt / R = -mu_r*g*cosPhi/R
    const muRGOverR = (params.muRolling * g) / R

    return {
      alpha: [muRGOverR * sinPhi, -muRGOverR * cosPhi, -spinDecel * omegaZSign],
      omega0: [ball.angularVelocity[0], ball.angularVelocity[1], ball.angularVelocity[2]],
    }
  }

  getTransitionTime(ball: Ball, config: PhysicsConfig): StateTransition | undefined {
    const params = ball.physicsParams
    const speed = vec3Magnitude2D(ball.velocity)
    if (speed < 1e-9) return undefined
    if (params.muRolling < 1e-12) return undefined

    const g = config.gravity
    const R = params.radius
    const dt = speed / (params.muRolling * g)

    // Check if z-spin will still be nonzero at stopping time
    const spinDecelRate = (5 * params.muSpinning * g) / (2 * R)
    const omegaZAtStop = Math.abs(ball.angularVelocity[2]) - spinDecelRate * dt
    const toState = omegaZAtStop > 1e-9 ? MotionState.Spinning : MotionState.Stationary

    return { dt, toState }
  }

  applyTransition(ball: Ball, toState: MotionState): void {
    if (toState === MotionState.Stationary) {
      ball.velocity = [0, 0, 0]
      ball.angularVelocity = [0, 0, 0]
    } else if (toState === MotionState.Spinning) {
      ball.velocity = [0, 0, 0]
      ball.angularVelocity[0] = 0
      ball.angularVelocity[1] = 0
    }
  }
}
