import Vector3D, { vec3Zero } from './vector3d'
import type Vector2D from './vector2d'
import { MotionState } from './motion-state'
import { BallPhysicsParams, PhysicsConfig, defaultBallParams, defaultPhysicsConfig } from './physics-config'
import {
  TrajectoryCoeffs,
  AngularVelCoeffs,
  evaluateTrajectory,
  evaluateTrajectoryVelocity,
  evaluateAngularVelocity,
} from './trajectory'
import { PhysicsProfile, createPoolPhysicsProfile } from './physics/physics-profile'

export default class Ball {
  /**
   * Invalidation counter for epoch-based lazy event filtering.
   * Incremented each time this ball is involved in a collision (see CollisionFinder.pop()).
   * Events stamped with a stale epoch are skipped without costly tree removal.
   */
  epoch: number = 0

  /** 3D position [x, y, z] in mm */
  position: Vector3D

  /** 3D velocity [vx, vy, vz] in mm/s */
  velocity: Vector3D

  /** 3D angular velocity [wx, wy, wz] in rad/s */
  angularVelocity: Vector3D

  /** Current motion state */
  motionState: MotionState

  /** Per-ball physics parameters */
  physicsParams: BallPhysicsParams

  /** Cached position trajectory: r(t) = a*t^2 + b*t + c */
  trajectory: TrajectoryCoeffs

  /** Cached angular velocity trajectory: omega(t) = alpha*t + omega0 */
  angularTrajectory: AngularVelCoeffs

  constructor(
    position: Vector3D | Vector2D,
    velocity: Vector3D | Vector2D,
    public radius: number,
    public time: number,
    public mass: number = defaultBallParams.mass,
    public id: string = crypto.randomUUID(),
    angularVelocity?: Vector3D,
    physicsParams?: BallPhysicsParams,
    physicsConfig?: PhysicsConfig,
  ) {
    // Support both 2D and 3D input for backward compatibility
    this.position = position.length === 3 ? (position as Vector3D) : [position[0], position[1], 0]
    this.velocity = velocity.length === 3 ? (velocity as Vector3D) : [velocity[0], velocity[1], 0]
    this.angularVelocity = angularVelocity ?? vec3Zero()
    this.physicsParams = physicsParams ?? { ...defaultBallParams, radius, mass: mass }

    const config = physicsConfig ?? defaultPhysicsConfig
    // Use a default pool profile for initial trajectory computation.
    // Callers should call updateTrajectory() with their desired profile after construction.
    const profile = createPoolPhysicsProfile()
    this.motionState = profile.determineMotionState(this.velocity, this.angularVelocity, this.radius)
    const model = profile.motionModels.get(this.motionState)!
    this.trajectory = model.computeTrajectory(this, config)
    this.angularTrajectory = model.computeAngularTrajectory(this, config)
  }

  get x() {
    return this.position[0]
  }

  get y() {
    return this.position[1]
  }

  /** 2D position for rendering compatibility */
  get position2D(): Vector2D {
    return [this.position[0], this.position[1]]
  }

  /** 2D velocity for rendering compatibility */
  get velocity2D(): Vector2D {
    return [this.velocity[0], this.velocity[1]]
  }

  toString(): string {
    const [x, y] = this.position
    const [vx, vy] = this.velocity
    return `${this.id} - P: (${x}, ${y}) R: ${this.radius}, V: (${vx}, ${vy}) S: ${this.motionState}`
  }

  /**
   * Compute position at an absolute time using cached trajectory coefficients.
   * Returns a 2D position for backward compatibility with renderers.
   */
  positionAtTime(time: number): Vector2D {
    const dt = time - this.time
    const traj = this.trajectory
    return [traj.a[0] * dt * dt + traj.b[0] * dt + traj.c[0], traj.a[1] * dt * dt + traj.b[1] * dt + traj.c[1]]
  }

  position3DAtTime(time: number): Vector3D {
    const dt = time - this.time
    return evaluateTrajectory(this.trajectory, dt)
  }

  velocityAtTime(time: number): Vector3D {
    const dt = time - this.time
    return evaluateTrajectoryVelocity(this.trajectory, dt)
  }

  /** Compute 3D angular velocity at an absolute time */
  angularVelocityAtTime(time: number): Vector3D {
    return evaluateAngularVelocity(this.angularTrajectory, time - this.time)
  }

  /**
   * Advances the ball to an absolute time, updating position, velocity,
   * and angular velocity from the trajectory coefficients.
   */
  advanceTime(time: number): this {
    const dt = time - this.time
    if (dt === 0) return this

    this.position = evaluateTrajectory(this.trajectory, dt)
    this.velocity = evaluateTrajectoryVelocity(this.trajectory, dt)
    this.angularVelocity = evaluateAngularVelocity(this.angularTrajectory, dt)
    this.time = time

    return this
  }

  /**
   * Recompute trajectory coefficients from current state.
   * Delegates state determination and trajectory computation to the PhysicsProfile's motion models.
   * Call after any velocity/angular velocity/state change.
   */
  updateTrajectory(profile: PhysicsProfile, config: PhysicsConfig): void {
    // Energy quiescence: when a ball with friction is moving below a perceptible
    // speed, snap directly to Stationary. At 2 mm/s with μ_rolling=0.01, a ball
    // travels ~0.2mm before stopping — invisible at 60fps. This skips the
    // Sliding→Rolling→Stationary state transition chain, eliminating thousands
    // of events in dense cluster settling.
    const QUIESCENCE_SPEED = 2 // mm/s
    const speed2D = Math.sqrt(this.velocity[0] ** 2 + this.velocity[1] ** 2)
    const hasFriction = this.physicsParams.muSliding > 0 || this.physicsParams.muRolling > 0
    if (hasFriction && speed2D > 0 && speed2D <= QUIESCENCE_SPEED && this.velocity[2] <= 0) {
      const hasZSpin = Math.abs(this.angularVelocity[2]) > 1e-6
      this.velocity[0] = 0
      this.velocity[1] = 0
      this.velocity[2] = 0
      this.angularVelocity[0] = 0
      this.angularVelocity[1] = 0
      if (!hasZSpin) this.angularVelocity[2] = 0
      this.motionState = hasZSpin ? MotionState.Spinning : MotionState.Stationary
    } else {
      this.motionState = profile.determineMotionState(this.velocity, this.angularVelocity, this.radius)
    }

    this.rebaseTrajectory(profile, config)
  }

  /**
   * Recompute trajectory coefficients without re-determining motion state.
   * Use when the ball's time/position/velocity has been updated (e.g., cell transitions)
   * but the motion state should be preserved. This ensures acceleration direction
   * (which depends on velocity direction) stays consistent with the current velocity.
   */
  rebaseTrajectory(profile: PhysicsProfile, config: PhysicsConfig): void {
    const model = profile.motionModels.get(this.motionState)!
    this.trajectory = model.computeTrajectory(this, config)
    this.angularTrajectory = model.computeAngularTrajectory(this, config)
  }

  /**
   * Sync trajectory reference point to current ball state.
   * Call after any position/velocity change that doesn't warrant a full
   * trajectory recomputation (e.g., wall clamping, snap-apart).
   * Does NOT touch trajectory.a (acceleration) or angularTrajectory.alpha.
   */
  syncTrajectoryOrigin(): void {
    this.trajectory.c = [this.position[0], this.position[1], this.position[2]]
    this.trajectory.b = [this.velocity[0], this.velocity[1], this.velocity[2]]
    this.angularTrajectory.omega0 = [this.angularVelocity[0], this.angularVelocity[1], this.angularVelocity[2]]
  }

  /**
   * Clamp position to within table bounds and sync trajectory origin.
   * Returns true if position was modified.
   */
  clampToBounds(tableWidth: number, tableHeight: number): boolean {
    const R = this.radius
    const x = Math.max(R, Math.min(tableWidth - R, this.position[0]))
    const y = Math.max(R, Math.min(tableHeight - R, this.position[1]))
    const changed = x !== this.position[0] || y !== this.position[1]
    if (changed) {
      this.position[0] = x
      this.position[1] = y
      this.syncTrajectoryOrigin()
    }
    return changed
  }
}
