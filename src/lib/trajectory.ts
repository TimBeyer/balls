/**
 * Trajectory coefficient computation for each motion state.
 *
 * Between events, ball position follows: r(t) = a*t^2 + b*t + c
 * where t is time relative to the ball's current `time` field.
 *
 * Angular velocity follows: omega(t) = alpha*t + omega0
 */

import Vector3D, { vec3Magnitude2D, vec3Zero } from './vector3d'
import { MotionState } from './motion-state'
import type { BallPhysicsParams, PhysicsConfig } from './physics-config'

export interface TrajectoryCoeffs {
  /** Quadratic term (half-acceleration) */
  a: Vector3D
  /** Linear term (initial velocity) */
  b: Vector3D
  /** Constant term (initial position) */
  c: Vector3D
}

export interface AngularVelCoeffs {
  /** Angular acceleration (linear change rate of omega) */
  alpha: Vector3D
  /** Initial angular velocity */
  omega0: Vector3D
}

/**
 * Compute the relative velocity at the contact point between ball and cloth.
 * u = v + R * (k_hat × omega) where k_hat = [0, 0, 1]
 * k_hat × omega = [-omega_y, omega_x, 0]
 * So: u = [vx - R*omega_y, vy + R*omega_x, 0]
 */
export function computeRelativeVelocity(velocity: Vector3D, angularVelocity: Vector3D, radius: number): Vector3D {
  return [velocity[0] - radius * angularVelocity[1], velocity[1] + radius * angularVelocity[0], 0]
}

/**
 * Determine the motion state of a ball from its velocity and angular velocity.
 */
export function determineMotionState(
  velocity: Vector3D,
  angularVelocity: Vector3D,
  radius: number,
  threshold: number = 1e-6,
): MotionState {
  const speed = vec3Magnitude2D(velocity)
  const hasVelocity = speed > threshold

  if (!hasVelocity) {
    const hasZSpin = Math.abs(angularVelocity[2]) > threshold
    return hasZSpin ? MotionState.Spinning : MotionState.Stationary
  }

  // Check relative velocity to distinguish sliding from rolling
  const relVel = computeRelativeVelocity(velocity, angularVelocity, radius)
  const relSpeed = vec3Magnitude2D(relVel)

  return relSpeed > threshold ? MotionState.Sliding : MotionState.Rolling
}

/**
 * Compute position trajectory coefficients for the given motion state.
 * r(t) = a*t^2 + b*t + c, where t is time elapsed since ball's current time.
 */
export function computeTrajectory(
  position: Vector3D,
  velocity: Vector3D,
  angularVelocity: Vector3D,
  motionState: MotionState,
  params: BallPhysicsParams,
  config: PhysicsConfig,
): TrajectoryCoeffs {
  const g = config.gravity

  switch (motionState) {
    case MotionState.Stationary:
    case MotionState.Spinning:
      return {
        a: vec3Zero(),
        b: vec3Zero(),
        c: [position[0], position[1], position[2]],
      }

    case MotionState.Rolling: {
      const speed = vec3Magnitude2D(velocity)
      if (speed < 1e-12) {
        return { a: vec3Zero(), b: vec3Zero(), c: [position[0], position[1], position[2]] }
      }
      // Direction of motion
      const cosPhi = velocity[0] / speed
      const sinPhi = velocity[1] / speed
      // Deceleration due to rolling friction: a = -0.5 * mu_r * g * direction
      const halfMuRG = 0.5 * params.muRolling * g
      return {
        a: [-halfMuRG * cosPhi, -halfMuRG * sinPhi, 0],
        b: [velocity[0], velocity[1], velocity[2]],
        c: [position[0], position[1], position[2]],
      }
    }

    case MotionState.Sliding: {
      // Relative velocity at contact point determines friction direction
      const relVel = computeRelativeVelocity(velocity, angularVelocity, params.radius)
      const relSpeed = vec3Magnitude2D(relVel)

      if (relSpeed < 1e-12) {
        // Already rolling — shouldn't happen if state is correct, but be safe
        return computeTrajectory(position, velocity, angularVelocity, MotionState.Rolling, params, config)
      }

      // Friction decelerates in direction of relative velocity
      const uHatX = relVel[0] / relSpeed
      const uHatY = relVel[1] / relSpeed
      const halfMuSG = 0.5 * params.muSliding * g

      return {
        a: [-halfMuSG * uHatX, -halfMuSG * uHatY, 0],
        b: [velocity[0], velocity[1], velocity[2]],
        c: [position[0], position[1], position[2]],
      }
    }
  }
}

/**
 * Compute angular velocity trajectory coefficients.
 * omega(t) = alpha*t + omega0
 */
export function computeAngularTrajectory(
  velocity: Vector3D,
  angularVelocity: Vector3D,
  motionState: MotionState,
  params: BallPhysicsParams,
  config: PhysicsConfig,
): AngularVelCoeffs {
  const g = config.gravity
  const R = params.radius
  // Spinning friction deceleration rate for omega_z
  const spinDecel = (5 * params.muSpinning * g) / (2 * R)
  const omegaZSign = angularVelocity[2] > 0 ? 1 : angularVelocity[2] < 0 ? -1 : 0

  switch (motionState) {
    case MotionState.Stationary:
      return { alpha: vec3Zero(), omega0: vec3Zero() }

    case MotionState.Spinning:
      return {
        alpha: [0, 0, -spinDecel * omegaZSign],
        omega0: [angularVelocity[0], angularVelocity[1], angularVelocity[2]],
      }

    case MotionState.Rolling: {
      // Rolling constraint: omega_xy is tied to velocity
      // omega_x = -v_y / R, omega_y = v_x / R
      // As velocity decelerates, so does omega_xy
      const speed = vec3Magnitude2D(velocity)
      if (speed < 1e-12) {
        return {
          alpha: [0, 0, -spinDecel * omegaZSign],
          omega0: [angularVelocity[0], angularVelocity[1], angularVelocity[2]],
        }
      }
      const cosPhi = velocity[0] / speed
      const sinPhi = velocity[1] / speed
      // d(omega)/dt due to rolling friction deceleration of v:
      // alpha_x = -(-mu_r*g*sinPhi)/R = mu_r*g*sinPhi/R
      // alpha_y = -(mu_r*g*cosPhi)/R = -mu_r*g*cosPhi/R
      // Wait, from the rolling constraint: omega_x = -v_y/R, omega_y = v_x/R
      // dv/dt = -mu_r * g * v_hat → dv_x/dt = -mu_r*g*cosPhi, dv_y/dt = -mu_r*g*sinPhi
      // d(omega_x)/dt = -dv_y/dt / R = mu_r*g*sinPhi/R
      // d(omega_y)/dt = dv_x/dt / R = -mu_r*g*cosPhi/R
      const muRGOverR = (params.muRolling * g) / R
      return {
        alpha: [muRGOverR * sinPhi, -muRGOverR * cosPhi, -spinDecel * omegaZSign],
        omega0: [angularVelocity[0], angularVelocity[1], angularVelocity[2]],
      }
    }

    case MotionState.Sliding: {
      // Sliding friction changes omega_xy based on relative velocity direction
      const relVel = computeRelativeVelocity(velocity, angularVelocity, R)
      const relSpeed = vec3Magnitude2D(relVel)

      if (relSpeed < 1e-12) {
        return computeAngularTrajectory(velocity, angularVelocity, MotionState.Rolling, params, config)
      }

      const uHatX = relVel[0] / relSpeed
      const uHatY = relVel[1] / relSpeed

      // Angular acceleration from sliding friction:
      // d(omega)/dt = -(5 * mu_s * g) / (2 * R) * (k_hat × u_hat)
      // k_hat × u_hat = [-u_hat_y, u_hat_x, 0]
      const slidingAngDecel = (5 * params.muSliding * g) / (2 * R)
      return {
        alpha: [slidingAngDecel * uHatY, -slidingAngDecel * uHatX, -spinDecel * omegaZSign],
        omega0: [angularVelocity[0], angularVelocity[1], angularVelocity[2]],
      }
    }
  }
}

/**
 * Evaluate position at time t (relative to trajectory start).
 */
export function evaluateTrajectory(traj: TrajectoryCoeffs, t: number): Vector3D {
  return [
    traj.a[0] * t * t + traj.b[0] * t + traj.c[0],
    traj.a[1] * t * t + traj.b[1] * t + traj.c[1],
    traj.a[2] * t * t + traj.b[2] * t + traj.c[2],
  ]
}

/**
 * Evaluate velocity at time t (derivative of position trajectory).
 * v(t) = 2*a*t + b
 */
export function evaluateTrajectoryVelocity(traj: TrajectoryCoeffs, t: number): Vector3D {
  return [2 * traj.a[0] * t + traj.b[0], 2 * traj.a[1] * t + traj.b[1], 2 * traj.a[2] * t + traj.b[2]]
}

/**
 * Evaluate angular velocity at time t.
 * omega(t) = alpha*t + omega0
 */
export function evaluateAngularVelocity(angTraj: AngularVelCoeffs, t: number): Vector3D {
  return [
    angTraj.alpha[0] * t + angTraj.omega0[0],
    angTraj.alpha[1] * t + angTraj.omega0[1],
    angTraj.alpha[2] * t + angTraj.omega0[2],
  ]
}
