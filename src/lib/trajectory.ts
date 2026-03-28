/**
 * Trajectory coefficient types and evaluation functions.
 *
 * Between events, ball position follows: r(t) = a*t^2 + b*t + c
 * where t is time relative to the ball's current `time` field.
 *
 * Angular velocity follows: omega(t) = alpha*t + omega0
 *
 * Trajectory *computation* is handled by MotionModel implementations
 * in `physics/motion/`. This file provides the shared types and
 * pure evaluation helpers used by Ball and collision detectors.
 */

import Vector3D from './vector3d'

export interface TrajectoryCoeffs {
  /** Quadratic term (half-acceleration) */
  a: Vector3D
  /** Linear term (initial velocity) */
  b: Vector3D
  /** Constant term (initial position) */
  c: Vector3D
  /** Maximum time offset for which this trajectory is physically valid.
   *  Beyond this, the polynomial extrapolates into unphysical territory
   *  (e.g., velocity reversal after friction brings the ball to rest). */
  maxDt: number
}

export interface AngularVelCoeffs {
  /** Angular acceleration (linear change rate of omega) */
  alpha: Vector3D
  /** Initial angular velocity */
  omega0: Vector3D
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
