import Ball from '../ball'
import type Vector2D from '../vector2d'
import type Vector3D from '../vector3d'
import { BallPhysicsParams, PhysicsConfig } from '../physics-config'

/** Zero-friction physics params for backward-compatible tests */
export const zeroFrictionParams: BallPhysicsParams = {
  mass: 100,
  radius: 10,
  muSliding: 0,
  muRolling: 0,
  muSpinning: 0,
  eRestitution: 1.0,
}

/** Zero-friction physics config (still needs realistic cushion height) */
export const zeroFrictionConfig: PhysicsConfig = {
  gravity: 9810,
  cushionHeight: 3.5, // mm above ball center — realistic for a pool cushion
  eTableRestitution: 0.5,
  defaultBallParams: zeroFrictionParams,
}

/**
 * Create a ball with zero friction — behaves like the old Circle class
 * (constant velocity, linear position interpolation).
 */
export function createTestBall(
  position: Vector2D | Vector3D,
  velocity: Vector2D | Vector3D,
  radius: number = 10,
  time: number = 0,
  mass: number = 100,
  id?: string,
): Ball {
  return new Ball(
    position,
    velocity,
    radius,
    time,
    mass,
    id,
    [0, 0, 0],
    { ...zeroFrictionParams, radius, mass },
    zeroFrictionConfig,
  )
}
