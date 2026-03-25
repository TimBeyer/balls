import { Cushion, CushionCollision, CollisionFinder, StateTransitionEvent } from './collision'
import type Vector2D from './vector2d'
import type Ball from './ball'
import { MotionState } from './motion-state'
import { PhysicsConfig, defaultPhysicsConfig } from './physics-config'
import type { PhysicsProfile } from './physics/physics-profile'
import { createPoolPhysicsProfile } from './physics/physics-profile'
import type Vector3D from './vector3d'
import type { Han2005CushionResolver } from './physics/collision/han2005-cushion-resolver'

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
        model.applyTransition(ball, stateEvent.toState as MotionState)
      }
      ball.motionState = stateEvent.toState as MotionState

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
    } else {
      // Ball-ball collision
      const c1 = event.circles[0]
      const c2 = event.circles[1]

      // Delegate to the ball collision resolver
      profile.ballCollisionResolver.resolve(c1, c2, physicsConfig)

      c1.updateTrajectory(profile, physicsConfig)
      c2.updateTrajectory(profile, physicsConfig)
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
