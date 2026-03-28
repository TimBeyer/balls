export interface BallPhysicsParams {
  mass: number // kg (pool ball ~0.17)
  radius: number // mm (pool ball ~28.575, snooker ~26.25)
  muSliding: number // sliding friction coefficient
  muRolling: number // rolling friction coefficient
  muSpinning: number // spinning friction coefficient
  eRestitution: number // coefficient of restitution (cushion bounce)
  eBallBall: number // coefficient of restitution (ball-ball collision)
}

export interface PhysicsConfig {
  gravity: number // mm/s^2 (9810 = 9.81 m/s^2 converted)
  cushionHeight: number // mm, height of cushion contact point above ball center
  eTableRestitution: number // coefficient of restitution for ball-table bounce
  defaultBallParams: BallPhysicsParams
}

export const defaultBallParams: BallPhysicsParams = {
  mass: 0.17,
  radius: 37.5,
  muSliding: 0.2,
  muRolling: 0.01,
  muSpinning: 0.044,
  eRestitution: 0.85,
  eBallBall: 0.93,
}

export const zeroFrictionBallParams: BallPhysicsParams = {
  mass: 100,
  radius: 37.5,
  muSliding: 0,
  muRolling: 0,
  muSpinning: 0,
  eRestitution: 1.0,
  eBallBall: 1.0,
}

export const zeroFrictionConfig: PhysicsConfig = {
  gravity: 9810,
  cushionHeight: 10.1,
  eTableRestitution: 0.5,
  defaultBallParams: zeroFrictionBallParams,
}

export const defaultPhysicsConfig: PhysicsConfig = {
  gravity: 9810, // mm/s^2
  // Cushion contact height above ball center in mm.
  // Standard pool table: cushion nose is at ~63.5% of ball diameter from the table surface.
  // For R=37.5mm ball: nose at ~47.6mm from surface, ball center at 37.5mm.
  // So cushionHeight = 47.6 - 37.5 ≈ 10.1mm above center.
  // This gives sinTheta ≈ 0.27, theta ≈ 15.5° — reasonable for the Han 2005 model.
  cushionHeight: 10.1,
  eTableRestitution: 0.5,
  defaultBallParams,
}
