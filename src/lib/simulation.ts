import { Cushion, CushionCollision, CollisionFinder, StateTransitionEvent } from './collision'
import type Vector2D from './vector2d'
import type Ball from './ball'
import { MotionState } from './motion-state'
import { PhysicsConfig, defaultPhysicsConfig } from './physics-config'
import type { PhysicsProfile } from './physics/physics-profile'
import { createPoolPhysicsProfile } from './physics/physics-profile'
import type Vector3D from './vector3d'
import type { Han2005CushionResolver } from './physics/collision/han2005-cushion-resolver'
import { resolveContacts } from './physics/collision/contact-resolver'

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

/** Clamp a ball's position to within table bounds (for balls that flew past while airborne) */
function clampToBounds(ball: Ball, tableWidth: number, tableHeight: number) {
  const R = ball.radius
  ball.position[0] = Math.max(R, Math.min(tableWidth - R, ball.position[0]))
  ball.position[1] = Math.max(R, Math.min(tableHeight - R, ball.position[1]))
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
 * Core event-driven simulation loop.
 *
 * This is a thin coordinator — all physics decisions are delegated to the PhysicsProfile:
 * - Collision detection via profile.ballBallDetector / profile.cushionDetector
 * - Collision resolution via profile.ballCollisionResolver / profile.cushionCollisionResolver
 * - State transitions via profile.motionModels[state].applyTransition()
 * - Trajectory computation via profile.motionModels[state].computeTrajectory()
 *
 * @param time the total timespan (in seconds) to simulate
 */
export function simulate(
  tableWidth: number,
  tableHeight: number,
  time: number,
  circles: Ball[],
  physicsConfig: PhysicsConfig = defaultPhysicsConfig,
  profile: PhysicsProfile = createPoolPhysicsProfile(),
) {
  let currentTime = 0
  const replay: ReplayData[] = []

  // Ensure all balls have up-to-date trajectories via the profile
  for (const ball of circles) {
    ball.updateTrajectory(profile, physicsConfig)
  }

  // initial snapshot
  replay.push({
    time: 0,
    type: EventType.StateUpdate,
    snapshots: circles.map(snapshotBall),
  })

  const collisionFinder = new CollisionFinder(tableWidth, tableHeight, circles, physicsConfig, profile)

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

      // Delegate state transition to the motion model
      const model = profile.motionModels.get(stateEvent.fromState as MotionState)
      if (model) {
        model.applyTransition(ball, stateEvent.toState as MotionState, physicsConfig)
      }
      ball.motionState = stateEvent.toState as MotionState

      // Clamp position to within bounds — airborne balls may have flown past the
      // boundary, and contact resolution can push balls slightly past walls.
      clampToBounds(ball, tableWidth, tableHeight)

      ball.updateTrajectory(profile, physicsConfig)
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

      // Delegate to the cushion collision resolver
      profile.cushionCollisionResolver.resolve(ball, cc.cushion, tableWidth, tableHeight, physicsConfig)

      ball.updateTrajectory(profile, physicsConfig)

      // Post-collision trajectory clamping (if resolver supports it)
      const resolver = profile.cushionCollisionResolver as Han2005CushionResolver
      if (resolver.clampTrajectory) {
        resolver.clampTrajectory(ball, cc.cushion)
      }

      // Corner bounce: after resolving one cushion, the ball may be at another wall
      // boundary with velocity into it (e.g., hitting North while at East boundary).
      // The quadratic cushion detector can't detect t=0 collisions, so handle immediately.
      const R = ball.radius
      if (ball.velocity[0] > 0 && ball.position[0] >= tableWidth - R - 0.01) {
        profile.cushionCollisionResolver.resolve(ball, Cushion.East, tableWidth, tableHeight, physicsConfig)
        ball.updateTrajectory(profile, physicsConfig)
        if (resolver.clampTrajectory) resolver.clampTrajectory(ball, Cushion.East)
      } else if (ball.velocity[0] < 0 && ball.position[0] <= R + 0.01) {
        profile.cushionCollisionResolver.resolve(ball, Cushion.West, tableWidth, tableHeight, physicsConfig)
        ball.updateTrajectory(profile, physicsConfig)
        if (resolver.clampTrajectory) resolver.clampTrajectory(ball, Cushion.West)
      }
      if (ball.velocity[1] > 0 && ball.position[1] >= tableHeight - R - 0.01) {
        profile.cushionCollisionResolver.resolve(ball, Cushion.North, tableWidth, tableHeight, physicsConfig)
        ball.updateTrajectory(profile, physicsConfig)
        if (resolver.clampTrajectory) resolver.clampTrajectory(ball, Cushion.North)
      } else if (ball.velocity[1] < 0 && ball.position[1] <= R + 0.01) {
        profile.cushionCollisionResolver.resolve(ball, Cushion.South, tableWidth, tableHeight, physicsConfig)
        ball.updateTrajectory(profile, physicsConfig)
        if (resolver.clampTrajectory) resolver.clampTrajectory(ball, Cushion.South)
      }
    } else {
      // Ball-ball collision
      const c1 = event.circles[0]
      const c2 = event.circles[1]

      // Snap to exact touching distance before resolving. Floating-point evaluation
      // of the trajectory polynomial can leave balls slightly overlapping at the
      // predicted collision time, which would cause the overlap guard to silently
      // skip future collisions for this pair.
      const dx = c1.position[0] - c2.position[0]
      const dy = c1.position[1] - c2.position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const rSum = c1.radius + c2.radius
      if (dist > 0 && dist !== rSum) {
        const half = (rSum - dist) / 2
        const nx = dx / dist
        const ny = dy / dist
        c1.position[0] += nx * half
        c1.position[1] += ny * half
        c2.position[0] -= nx * half
        c2.position[1] -= ny * half
      }

      profile.ballCollisionResolver.resolve(c1, c2, physicsConfig)
      c1.updateTrajectory(profile, physicsConfig)
      c2.updateTrajectory(profile, physicsConfig)
      clampToBounds(c1, tableWidth, tableHeight)
      clampToBounds(c2, tableWidth, tableHeight)

      // Wall clamping may have re-introduced overlap. Iteratively push apart
      // using half-overlap per ball (each iteration halves any remaining overlap
      // from wall-locked balls that can't move).
      for (let sep = 0; sep < 5; sep++) {
        const dx2 = c1.position[0] - c2.position[0]
        const dy2 = c1.position[1] - c2.position[1]
        const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
        const rSum2 = c1.radius + c2.radius
        if (dist2 <= 0 || dist2 >= rSum2) break
        const half = (rSum2 - dist2) / 2
        const nx2 = dx2 / dist2
        const ny2 = dy2 / dist2
        c1.position[0] += nx2 * half
        c1.position[1] += ny2 * half
        c2.position[0] -= nx2 * half
        c2.position[1] -= ny2 * half
        clampToBounds(c1, tableWidth, tableHeight)
        clampToBounds(c2, tableWidth, tableHeight)
      }

      // Rebase trajectory.c to match actual position after clamp/push.
      // Without this, the quartic detector uses stale position data, causing
      // wrong collision times and visual teleportation.
      c1.trajectory.c = [c1.position[0], c1.position[1], c1.position[2]]
      c2.trajectory.c = [c2.position[0], c2.position[1], c2.position[2]]

      currentTime = event.time

      // Record primary collision BEFORE contact resolution (which may move c1/c2)
      replay.push({
        time: currentTime,
        type: EventType.CircleCollision,
        snapshots: event.circles.map(snapshotBall),
      })

      // Contact resolution: handle all instant cascading contacts inline,
      // outside the event queue. This prevents epoch invalidation from
      // causing missed collisions when multiple balls collide simultaneously.
      const contactResult = resolveContacts(
        [c1, c2],
        circles.length,
        collisionFinder.spatialGrid,
        profile.ballCollisionResolver,
        profile,
        physicsConfig,
        event.time,
        tableWidth,
        tableHeight,
      )

      // Record contact chain collisions
      for (const contactEvent of contactResult.replayEvents) {
        replay.push({
          time: contactEvent.time,
          type: EventType.CircleCollision,
          snapshots: contactEvent.snapshots,
        })
      }

      // Recompute for ALL affected balls (primary + contact chain)
      const allAffected = new Set([c1, c2, ...contactResult.affectedBalls])
      for (const ball of allAffected) {
        collisionFinder.recompute(ball.id)
      }
      continue
    }

    // Clamp non-airborne balls that may have drifted past table bounds while airborne
    for (const circle of event.circles) {
      if (circle.motionState !== MotionState.Airborne) {
        clampToBounds(circle, tableWidth, tableHeight)
        // Rebase trajectory.c to match clamped position
        circle.trajectory.c = [circle.position[0], circle.position[1], circle.position[2]]
      }
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
