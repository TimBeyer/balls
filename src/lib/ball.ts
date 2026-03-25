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

  /** Compute 3D position at an absolute time */
  position3DAtTime(time: number): Vector3D {
    return evaluateTrajectory(this.trajectory, time - this.time)
  }

  /** Compute 3D velocity at an absolute time */
  velocityAtTime(time: number): Vector3D {
    return evaluateTrajectoryVelocity(this.trajectory, time - this.time)
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
    this.motionState = profile.determineMotionState(this.velocity, this.angularVelocity, this.radius)
    const model = profile.motionModels.get(this.motionState)!
    this.trajectory = model.computeTrajectory(this, config)
    this.angularTrajectory = model.computeAngularTrajectory(this, config)
  }
}
