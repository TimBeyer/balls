import { Cushion, CushionCollision, CollisionFinder } from './collision'
import type Vector2D from './vector2d'
import type Ball from './ball'
import { MotionState } from './motion-state'
import { PhysicsConfig, defaultPhysicsConfig } from './physics-config'
import type { StateTransitionEvent } from './state-transitions'
import type Vector3D from './vector3d'

export interface CircleSnapshot {
  id: string
  position: Vector2D
  velocity: Vector2D
  angularVelocity: Vector3D
  motionState: MotionState
  radius: number
  time: number
  /** Quadratic acceleration coefficients for interpolation between events */
  trajectoryA: Vector2D
}

export interface ReplayData {
  // Absolute timestamp
  time: number
  snapshots: CircleSnapshot[]
  type: EventType
  cushionType?: Cushion
}

export enum EventType {
  CircleCollision = 'CIRCLE_COLLISION',
  CushionCollision = 'CUSHION_COLLISION',
  StateTransition = 'STATE_TRANSITION',
  StateUpdate = 'STATE_UPDATE',
}

function snapshotBall(ball: Ball): CircleSnapshot {
  return {
    id: ball.id,
    position: [ball.position[0], ball.position[1]],
    velocity: [ball.velocity[0], ball.velocity[1]],
    angularVelocity: [ball.angularVelocity[0], ball.angularVelocity[1], ball.angularVelocity[2]],
    motionState: ball.motionState,
    radius: ball.radius,
    time: ball.time,
    trajectoryA: [ball.trajectory.a[0], ball.trajectory.a[1]],
  }
}

/**
 * Han 2005 cushion collision model.
 * Accounts for cushion height, friction at cushion contact, and spin transfer.
 *
 * The cushion contact point is above the ball center by `config.cushionHeight` mm.
 * This creates an angled impulse that transfers energy between linear and angular velocity.
 */
function resolveHan2005Cushion(ball: Ball, cushion: Cushion, config: PhysicsConfig): void {
  const R = ball.radius
  const e = ball.physicsParams.eRestitution

  // Cushion contact angle: theta = arcsin(cushionHeight / R)
  const sinTheta = Math.min(1, Math.max(-1, config.cushionHeight / R))
  const cosTheta = Math.sqrt(1 - sinTheta * sinTheta)
  const m = ball.physicsParams.mass

  let vPerp: number, vPar: number
  let omegaPar: number, omegaPerp: number, omegaZ: number

  const vx = ball.velocity[0]
  const vy = ball.velocity[1]
  const wx = ball.angularVelocity[0]
  const wy = ball.angularVelocity[1]
  const wz = ball.angularVelocity[2]

  switch (cushion) {
    case Cushion.North:
      vPerp = vy; vPar = vx; omegaPar = wy; omegaPerp = wx; omegaZ = wz
      break
    case Cushion.South:
      vPerp = -vy; vPar = -vx; omegaPar = -wy; omegaPerp = -wx; omegaZ = wz
      break
    case Cushion.East:
      vPerp = vx; vPar = -vy; omegaPar = wx; omegaPerp = -wy; omegaZ = wz
      break
    case Cushion.West:
      vPerp = -vx; vPar = vy; omegaPar = -wx; omegaPerp = wy; omegaZ = wz
      break
  }

  // Han 2005 intermediate calculations
  const c = vPerp * cosTheta
  const sx = vPar * sinTheta - vPerp * cosTheta + R * omegaPar
  const sy = -vPar - R * omegaZ * cosTheta + R * omegaPerp * sinTheta

  const Pze = m * c * (1 + e)
  const sNorm = Math.sqrt(sx * sx + sy * sy)
  const Pzs = (2 * m / 7) * sNorm

  let newVPerp: number, newVPar: number
  let newOmegaPar: number, newOmegaPerp: number, newOmegaZ: number

  if (sNorm < 1e-12 || Pzs <= Pze) {
    // Insufficient friction or no sliding — use friction-limited formulas
    newVPar = vPar - (2 / 7) * sx * sinTheta
    newVPerp = (2 / 7) * sx * cosTheta - (1 + e) * c * sinTheta

    newOmegaPar = omegaPar - (5 / (2 * R)) * sx * sinTheta
    newOmegaPerp = omegaPerp + (5 / (2 * R)) * sy * sinTheta
    newOmegaZ = omegaZ - (5 / (2 * R)) * sy * cosTheta
  } else {
    // Sufficient friction — full sliding regime
    const mu = Pze / (m * sNorm)
    const cosPhi = sx / sNorm
    const sinPhi = sy / sNorm

    newVPerp = -c * (1 + e) * (mu * cosPhi * cosTheta + sinTheta)
    newVPar = vPar + c * (1 + e) * mu * sinPhi

    newOmegaPar = omegaPar - (5 * c * (1 + e) * mu * cosPhi * sinTheta) / (2 * R)
    newOmegaPerp = omegaPerp + (5 * c * (1 + e) * mu * sinPhi * sinTheta) / (2 * R)
    newOmegaZ = omegaZ - (5 * c * (1 + e) * mu * sinPhi * cosTheta) / (2 * R)
  }

  // Map back from cushion-local to world frame
  // Ensure the perpendicular velocity points away from the wall
  switch (cushion) {
    case Cushion.North:
      ball.velocity[0] = newVPar
      ball.velocity[1] = -Math.abs(newVPerp)
      ball.angularVelocity[0] = newOmegaPerp
      ball.angularVelocity[1] = newOmegaPar
      ball.angularVelocity[2] = newOmegaZ
      break
    case Cushion.South:
      ball.velocity[0] = -newVPar
      ball.velocity[1] = Math.abs(newVPerp)
      ball.angularVelocity[0] = -newOmegaPerp
      ball.angularVelocity[1] = -newOmegaPar
      ball.angularVelocity[2] = newOmegaZ
      break
    case Cushion.East:
      ball.velocity[0] = -Math.abs(newVPerp)
      ball.velocity[1] = -newVPar
      ball.angularVelocity[0] = newOmegaPar
      ball.angularVelocity[1] = -newOmegaPerp
      ball.angularVelocity[2] = newOmegaZ
      break
    case Cushion.West:
      ball.velocity[0] = Math.abs(newVPerp)
      ball.velocity[1] = newVPar
      ball.angularVelocity[0] = -newOmegaPar
      ball.angularVelocity[1] = newOmegaPerp
      ball.angularVelocity[2] = newOmegaZ
      break
  }
  ball.velocity[2] = 0
}

/**
 * @param time the total timespan (in seconds) to simulate
 */
export function simulate(
  tableWidth: number,
  tableHeight: number,
  time: number,
  circles: Ball[],
  physicsConfig: PhysicsConfig = defaultPhysicsConfig,
) {
  let currentTime = 0
  const replay: ReplayData[] = []

  // Ensure all balls have up-to-date trajectories
  for (const ball of circles) {
    ball.updateTrajectory(physicsConfig)
  }

  // initial snapshot
  replay.push({
    time: 0,
    type: EventType.StateUpdate,
    snapshots: circles.map(snapshotBall),
  })

  const collisionFinder = new CollisionFinder(tableWidth, tableHeight, circles, physicsConfig)

  // Check if all balls are stationary
  const allStationary = () => circles.every((b) => b.motionState === MotionState.Stationary)

  while (currentTime < time && !allStationary()) {
    const event = collisionFinder.pop()

    if (event.time > time) break

    if (event.type === 'StateTransition') {
      const stateEvent = event as StateTransitionEvent
      const ball = stateEvent.circles[0]

      // Advance ball to transition time
      ball.advanceTime(stateEvent.time)

      // Apply state transition
      ball.motionState = stateEvent.toState

      // Zero out velocity/spin for terminal states
      if (stateEvent.toState === MotionState.Stationary) {
        ball.velocity = [0, 0, 0]
        ball.angularVelocity = [0, 0, 0]
      } else if (stateEvent.toState === MotionState.Spinning) {
        ball.velocity = [0, 0, 0]
        // Keep angular velocity z-component, zero xy
        ball.angularVelocity[0] = 0
        ball.angularVelocity[1] = 0
      } else if (stateEvent.toState === MotionState.Rolling) {
        // Enforce rolling constraint: omega_x = -v_y/R, omega_y = v_x/R
        const R = ball.radius
        ball.angularVelocity[0] = -ball.velocity[1] / R
        ball.angularVelocity[1] = ball.velocity[0] / R
      }

      ball.updateTrajectory(physicsConfig)
      currentTime = stateEvent.time

      replay.push({
        time: currentTime,
        type: EventType.StateTransition,
        snapshots: [snapshotBall(ball)],
      })

      collisionFinder.recompute(ball.id)
      continue
    }

    // Collision event
    for (const circle of event.circles) {
      circle.advanceTime(event.time)
    }

    if (event.type === 'Cushion') {
      const cc = event as CushionCollision
      const ball = cc.circles[0]

      resolveHan2005Cushion(ball, cc.cushion, physicsConfig)

      // Snap position to boundary to prevent floating-point escape
      switch (cc.cushion) {
        case Cushion.North:
          ball.position[1] = tableHeight - ball.radius
          break
        case Cushion.East:
          ball.position[0] = tableWidth - ball.radius
          break
        case Cushion.South:
          ball.position[1] = ball.radius
          break
        case Cushion.West:
          ball.position[0] = ball.radius
          break
      }

      ball.updateTrajectory(physicsConfig)

      // Clamp perpendicular acceleration to prevent spin friction from pushing
      // ball back through the wall. After a cushion bounce with high spin, the
      // friction can accelerate the ball back into the wall faster than it
      // moves away (vy ≈ 0). Without clamping, the trajectory overshoots the
      // wall boundary before any event can intervene.
      // This approximates the ball "rolling along the rail."
      switch (cc.cushion) {
        case Cushion.North:
          if (ball.trajectory.a[1] > 0) ball.trajectory.a[1] = 0
          break
        case Cushion.South:
          if (ball.trajectory.a[1] < 0) ball.trajectory.a[1] = 0
          break
        case Cushion.East:
          if (ball.trajectory.a[0] > 0) ball.trajectory.a[0] = 0
          break
        case Cushion.West:
          if (ball.trajectory.a[0] < 0) ball.trajectory.a[0] = 0
          break
      }
    } else {
      // Ball-ball collision: elastic with mass support
      const c1 = event.circles[0]
      const c2 = event.circles[1]
      const [vx1, vy1] = c1.velocity
      const [vx2, vy2] = c2.velocity

      const [x1, y1] = c1.position
      const [x2, y2] = c2.position
      let dx = x1 - x2,
        dy = y1 - y2

      const dist = Math.sqrt(dx * dx + dy * dy)
      dx = dx / dist
      dy = dy / dist

      // Project velocities onto collision normal
      const v1dot = dx * vx1 + dy * vy1
      const v2dot = dx * vx2 + dy * vy2

      // Tangential remainders (perpendicular to collision normal, unchanged)
      const vx1Remainder = vx1 - dx * v1dot,
        vy1Remainder = vy1 - dy * v1dot
      const vx2Remainder = vx2 - dx * v2dot,
        vy2Remainder = vy2 - dy * v2dot

      // 1D elastic collision along the normal
      const commonVelocity = (2 * (c1.mass * v1dot + c2.mass * v2dot)) / (c1.mass + c2.mass)
      const v1NormalAfter = commonVelocity - v1dot
      const v2NormalAfter = commonVelocity - v2dot

      // Reconstruct 2D velocity: normal component + tangential remainder
      c1.velocity[0] = dx * v1NormalAfter + vx1Remainder
      c1.velocity[1] = dy * v1NormalAfter + vy1Remainder
      c2.velocity[0] = dx * v2NormalAfter + vx2Remainder
      c2.velocity[1] = dy * v2NormalAfter + vy2Remainder

      // Reset angular velocity to rolling constraint and zero z-spin.
      // Without this, residual spin from pre-collision state causes friction
      // to re-accelerate the ball or keep it spinning indefinitely.
      c1.velocity[2] = 0
      c2.velocity[2] = 0

      const R1 = c1.radius
      c1.angularVelocity[0] = -c1.velocity[1] / R1
      c1.angularVelocity[1] = c1.velocity[0] / R1
      c1.angularVelocity[2] = 0

      const R2 = c2.radius
      c2.angularVelocity[0] = -c2.velocity[1] / R2
      c2.angularVelocity[1] = c2.velocity[0] / R2
      c2.angularVelocity[2] = 0

      c1.updateTrajectory(physicsConfig)
      c2.updateTrajectory(physicsConfig)
    }

    currentTime = event.time

    const replayData: ReplayData = {
      time: currentTime,
      type: event.type === 'Cushion' ? EventType.CushionCollision : EventType.CircleCollision,
      cushionType: (event as CushionCollision).cushion,
      snapshots: event.circles.map(snapshotBall),
    }

    replay.push(replayData)

    for (const circle of event.circles) {
      collisionFinder.recompute(circle.id)
    }
  }
  return replay
}
