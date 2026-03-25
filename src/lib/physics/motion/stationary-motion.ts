import type Ball from '../../ball'
import type { TrajectoryCoeffs, AngularVelCoeffs } from '../../trajectory'
import { MotionState } from '../../motion-state'
import { vec3Zero } from '../../vector3d'
import type { MotionModel, StateTransition } from './motion-model'

export class StationaryMotion implements MotionModel {
  readonly state = MotionState.Stationary

  computeTrajectory(ball: Ball): TrajectoryCoeffs {
    return {
      a: vec3Zero(),
      b: vec3Zero(),
      c: [ball.position[0], ball.position[1], ball.position[2]],
    }
  }

  computeAngularTrajectory(): AngularVelCoeffs {
    return { alpha: vec3Zero(), omega0: vec3Zero() }
  }

  getTransitionTime(): StateTransition | undefined {
    return undefined
  }

  applyTransition(ball: Ball): void {
    ball.velocity = [0, 0, 0]
    ball.angularVelocity = [0, 0, 0]
  }
}
