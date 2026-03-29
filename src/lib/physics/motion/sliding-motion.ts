import type Ball from '../../ball'
import type { PhysicsConfig } from '../../physics-config'
import type { TrajectoryCoeffs, AngularVelCoeffs } from '../../trajectory'
import { MotionState } from '../../motion-state'
import { vec3Zero, vec3Magnitude2D } from '../../vector3d'
import { computeRelativeVelocity } from '../physics-profile'
import type { MotionModel, StateTransition } from './motion-model'

/**
 * Inline rolling trajectory computation for the edge case where relative
 * velocity is near zero but the ball was classified as Sliding.
 * Avoids circular dependency with RollingMotion.
 */
function rollingTrajectoryFallback(ball: Ball, config: PhysicsConfig): TrajectoryCoeffs {
  const speed = vec3Magnitude2D(ball.velocity)
  if (speed < 1e-12) {
    return { a: vec3Zero(), b: vec3Zero(), c: [ball.position[0], ball.position[1], ball.position[2]], maxDt: Infinity }
  }
  const params = ball.physicsParams
  const cosPhi = ball.velocity[0] / speed
  const sinPhi = ball.velocity[1] / speed
  const halfMuRG = 0.5 * params.muRolling * config.gravity
  const maxDt = speed / (params.muRolling * config.gravity)
  return {
    a: [-halfMuRG * cosPhi, -halfMuRG * sinPhi, 0],
    b: [ball.velocity[0], ball.velocity[1], ball.velocity[2]],
    c: [ball.position[0], ball.position[1], ball.position[2]],
    maxDt,
  }
}

function rollingAngularFallback(ball: Ball, config: PhysicsConfig): AngularVelCoeffs {
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
  const muRGOverR = (params.muRolling * g) / R
  return {
    alpha: [muRGOverR * sinPhi, -muRGOverR * cosPhi, -spinDecel * omegaZSign],
    omega0: [ball.angularVelocity[0], ball.angularVelocity[1], ball.angularVelocity[2]],
  }
}

export class SlidingMotion implements MotionModel {
  readonly state = MotionState.Sliding

  computeTrajectory(ball: Ball, config: PhysicsConfig): TrajectoryCoeffs {
    const params = ball.physicsParams
    const relVel = computeRelativeVelocity(ball.velocity, ball.angularVelocity, params.radius)
    const relSpeed = vec3Magnitude2D(relVel)

    if (relSpeed < 1e-12) {
      return rollingTrajectoryFallback(ball, config)
    }

    const uHatX = relVel[0] / relSpeed
    const uHatY = relVel[1] / relSpeed
    const halfMuSG = 0.5 * params.muSliding * config.gravity

    // Trajectory is only valid until the sliding-to-rolling transition
    const transitionDt = (2 / 7) * (relSpeed / (params.muSliding * config.gravity))

    return {
      a: [-halfMuSG * uHatX, -halfMuSG * uHatY, 0],
      b: [ball.velocity[0], ball.velocity[1], ball.velocity[2]],
      c: [ball.position[0], ball.position[1], ball.position[2]],
      maxDt: transitionDt,
    }
  }

  computeAngularTrajectory(ball: Ball, config: PhysicsConfig): AngularVelCoeffs {
    const params = ball.physicsParams
    const R = params.radius
    const g = config.gravity
    const spinDecel = (5 * params.muSpinning * g) / (2 * R)
    const omegaZSign = ball.angularVelocity[2] > 0 ? 1 : ball.angularVelocity[2] < 0 ? -1 : 0

    const relVel = computeRelativeVelocity(ball.velocity, ball.angularVelocity, R)
    const relSpeed = vec3Magnitude2D(relVel)

    if (relSpeed < 1e-12) {
      return rollingAngularFallback(ball, config)
    }

    const uHatX = relVel[0] / relSpeed
    const uHatY = relVel[1] / relSpeed
    const slidingAngDecel = (5 * params.muSliding * g) / (2 * R)

    return {
      alpha: [-slidingAngDecel * uHatY, slidingAngDecel * uHatX, -spinDecel * omegaZSign],
      omega0: [ball.angularVelocity[0], ball.angularVelocity[1], ball.angularVelocity[2]],
    }
  }

  getTransitionTime(ball: Ball, config: PhysicsConfig): StateTransition | undefined {
    const params = ball.physicsParams
    const R = params.radius
    const relVel = computeRelativeVelocity(ball.velocity, ball.angularVelocity, R)
    const relSpeed = vec3Magnitude2D(relVel)
    if (relSpeed < 1e-9) return undefined
    if (params.muSliding < 1e-12) return undefined

    const dt = (2 / 7) * (relSpeed / (params.muSliding * config.gravity))
    return { dt, toState: MotionState.Rolling }
  }

  applyTransition(ball: Ball): void {
    // Sliding → Rolling: enforce rolling constraint
    const R = ball.radius
    ball.angularVelocity[0] = -ball.velocity[1] / R
    ball.angularVelocity[1] = ball.velocity[0] / R
  }
}
