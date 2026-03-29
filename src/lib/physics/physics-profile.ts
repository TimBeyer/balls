/**
 * PhysicsProfile composes all physics components into a swappable bundle.
 *
 * Predefined profiles:
 * - createPoolPhysicsProfile(): Han 2005 cushion, elastic ball-ball, 4-state friction
 * - createSimple2DProfile(): simple reflection, elastic ball-ball, no friction
 *
 * Custom profiles can mix and match any MotionModel, CollisionResolver, and
 * CollisionDetector implementations.
 */

import { MotionState } from '../motion-state'
import type { MotionModel } from './motion/motion-model'
import type { BallCollisionResolver, CushionCollisionResolver } from './collision/collision-resolver'
import type { BallBallDetector, CushionDetector } from './detection/collision-detector'
import type Vector3D from '../vector3d'
import { vec3Magnitude2D } from '../vector3d'

// Motion model implementations
import { StationaryMotion } from './motion/stationary-motion'
import { SpinningMotion } from './motion/spinning-motion'
import { RollingMotion } from './motion/rolling-motion'
import { SlidingMotion } from './motion/sliding-motion'
import { AirborneMotion } from './motion/airborne-motion'

// Collision resolver implementations
import { ElasticBallResolver } from './collision/elastic-ball-resolver'
import { Han2005CushionResolver } from './collision/han2005-cushion-resolver'
import { SimpleCushionResolver } from './collision/simple-cushion-resolver'

// Collision detector implementations
import { QuarticBallBallDetector } from './detection/ball-ball-detector'
import { QuadraticCushionDetector } from './detection/cushion-detector'

export interface PhysicsProfile {
  readonly name: string
  readonly motionModels: Map<MotionState, MotionModel>
  readonly ballCollisionResolver: BallCollisionResolver
  readonly cushionCollisionResolver: CushionCollisionResolver
  readonly ballBallDetector: BallBallDetector
  readonly cushionDetector: CushionDetector

  /** Determine the current motion state from ball velocity and angular velocity */
  determineMotionState(velocity: Vector3D, angularVelocity: Vector3D, radius: number): MotionState
}

/**
 * Compute the relative velocity at the contact point between ball and cloth.
 * u = v + R * (k_hat x omega) where k_hat = [0, 0, 1]
 * Shared utility used by multiple motion models and state determination.
 */
export function computeRelativeVelocity(velocity: Vector3D, angularVelocity: Vector3D, radius: number): Vector3D {
  return [velocity[0] - radius * angularVelocity[1], velocity[1] + radius * angularVelocity[0], 0]
}

/**
 * Standard pool/billiards state determination logic.
 * Used by the pool profile; other profiles may implement differently.
 */
export function determinePoolMotionState(
  velocity: Vector3D,
  angularVelocity: Vector3D,
  radius: number,
  threshold: number = 1e-6,
): MotionState {
  // Check for airborne first (ball has upward velocity or is above table)
  if (velocity[2] > threshold) {
    return MotionState.Airborne
  }

  const speed = vec3Magnitude2D(velocity)
  const hasVelocity = speed > threshold

  if (!hasVelocity) {
    const hasZSpin = Math.abs(angularVelocity[2]) > threshold
    return hasZSpin ? MotionState.Spinning : MotionState.Stationary
  }

  const relVel = computeRelativeVelocity(velocity, angularVelocity, radius)
  const relSpeed = vec3Magnitude2D(relVel)

  return relSpeed > threshold ? MotionState.Sliding : MotionState.Rolling
}

/**
 * Simple state determination: only Stationary or Rolling (no friction states).
 */
export function determineSimpleMotionState(
  velocity: Vector3D,
  _angularVelocity: Vector3D,
  _radius: number,
  threshold: number = 1e-6,
): MotionState {
  const speed = vec3Magnitude2D(velocity)
  return speed > threshold ? MotionState.Rolling : MotionState.Stationary
}

/**
 * Full pool physics: Han 2005 cushion, elastic ball-ball, 4-state friction model.
 */
export function createPoolPhysicsProfile(): PhysicsProfile {
  const motionModels = new Map<MotionState, MotionModel>([
    [MotionState.Stationary, new StationaryMotion()],
    [MotionState.Spinning, new SpinningMotion()],
    [MotionState.Rolling, new RollingMotion()],
    [MotionState.Sliding, new SlidingMotion()],
    [MotionState.Airborne, new AirborneMotion()],
  ])

  return {
    name: 'Pool',
    motionModels,
    ballCollisionResolver: new ElasticBallResolver(),
    cushionCollisionResolver: new Han2005CushionResolver(),
    ballBallDetector: new QuarticBallBallDetector(),
    cushionDetector: new QuadraticCushionDetector(),
    determineMotionState: determinePoolMotionState,
  }
}

/**
 * Simple 2D physics: elastic collisions, simple cushion reflection, no friction.
 * Balls only have Stationary and Rolling states (no Sliding/Spinning).
 */
export function createSimple2DProfile(): PhysicsProfile {
  const motionModels = new Map<MotionState, MotionModel>([
    [MotionState.Stationary, new StationaryMotion()],
    [MotionState.Rolling, new RollingMotion()],
    // Map Spinning/Sliding to Stationary/Rolling for safety
    [MotionState.Spinning, new StationaryMotion()],
    [MotionState.Sliding, new RollingMotion()],
  ])

  return {
    name: 'Simple 2D',
    motionModels,
    ballCollisionResolver: new ElasticBallResolver(),
    cushionCollisionResolver: new SimpleCushionResolver(),
    ballBallDetector: new QuarticBallBallDetector(),
    cushionDetector: new QuadraticCushionDetector(),
    determineMotionState: determineSimpleMotionState,
  }
}
