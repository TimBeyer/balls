import { Cushion, CushionCollision, CollisionFinder, StateTransitionEvent } from './collision'
import type Vector2D from './vector2d'
import type Ball from './ball'
import { MotionState } from './motion-state'
import { PhysicsConfig, defaultPhysicsConfig } from './physics-config'
import type { PhysicsProfile } from './physics/physics-profile'
import { createPoolPhysicsProfile } from './physics/physics-profile'
import type Vector3D from './vector3d'
import type { Han2005CushionResolver } from './physics/collision/han2005-cushion-resolver'
import { solveContactCluster } from './physics/collision/contact-cluster-solver'

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
  /** Angular trajectory: omega(dt) = alpha*dt + omega0 for smooth spin interpolation */
  angularAlpha: Vector3D
  angularOmega0: Vector3D
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

export interface SimulateOptions {
  /** Enable runtime invariant assertions for debugging. */
  debug?: boolean
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
    angularAlpha: [ball.angularTrajectory.alpha[0], ball.angularTrajectory.alpha[1], ball.angularTrajectory.alpha[2]],
    angularOmega0: [ball.angularTrajectory.omega0[0], ball.angularTrajectory.omega0[1], ball.angularTrajectory.omega0[2]],
  }
}

/**
 * Runtime invariant check — asserts ball state is consistent.
 * Only called when debug mode is enabled.
 */
function assertBallInvariants(
  ball: Ball,
  tableWidth: number,
  tableHeight: number,
  context: string,
): void {
  const R = ball.radius
  const margin = 2 // mm tolerance

  // No NaN/Infinity
  if (
    !Number.isFinite(ball.position[0]) ||
    !Number.isFinite(ball.position[1]) ||
    !Number.isFinite(ball.velocity[0]) ||
    !Number.isFinite(ball.velocity[1])
  ) {
    throw new Error(`[${context}] Ball ${ball.id.slice(0, 8)} has NaN/Infinity in position or velocity`)
  }

  // Position in bounds (skip airborne balls)
  if (ball.motionState !== MotionState.Airborne) {
    if (
      ball.position[0] < R - margin ||
      ball.position[0] > tableWidth - R + margin ||
      ball.position[1] < R - margin ||
      ball.position[1] > tableHeight - R + margin
    ) {
      throw new Error(
        `[${context}] Ball ${ball.id.slice(0, 8)} out of bounds: ` +
          `pos=(${ball.position[0].toFixed(2)}, ${ball.position[1].toFixed(2)}), ` +
          `bounds=[${R}, ${(tableWidth - R).toFixed(0)}] x [${R}, ${(tableHeight - R).toFixed(0)}]`,
      )
    }
  }

  // Trajectory.c matches position
  const dc =
    Math.abs(ball.trajectory.c[0] - ball.position[0]) + Math.abs(ball.trajectory.c[1] - ball.position[1])
  if (dc > 0.01) {
    throw new Error(
      `[${context}] Ball ${ball.id.slice(0, 8)} trajectory.c mismatch: ` +
        `pos=(${ball.position[0].toFixed(4)}, ${ball.position[1].toFixed(4)}) ` +
        `traj.c=(${ball.trajectory.c[0].toFixed(4)}, ${ball.trajectory.c[1].toFixed(4)}) delta=${dc.toFixed(6)}`,
    )
  }
}

function assertAllBalls(
  circles: Ball[],
  tableWidth: number,
  tableHeight: number,
  context: string,
): void {
  for (const c of circles) {
    assertBallInvariants(c, tableWidth, tableHeight, context)
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
  options?: SimulateOptions,
) {
  const debug = options?.debug ?? false
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

  // Pair collision rate tracker: detects Zeno cascades where external forces
  // keep pushing the same pair back together. Three tiers:
  //   1-BUDGET: normal physics (capped progressive restitution)
  //   BUDGET+1 to 2*BUDGET: force fully inelastic
  //   >2*BUDGET: suppress pair (skip detection in recompute until window resets)
  const pairCollisionCounts = new Map<string, { count: number; windowStart: number }>()
  const PAIR_BUDGET = 30
  const PAIR_WINDOW = 0.2 // seconds
  // Suppressed pairs: these pairs are excluded from ball-ball detection during
  // recompute() until the time window expires. Stored as "id1\0id2" where id1 < id2.
  const suppressedPairs = new Set<string>()

  function getPairKey(a: string, b: string): string {
    return a < b ? a + '\0' + b : b + '\0' + a
  }

  /** Returns 0 = normal, 1 = force inelastic, 2 = suppress pair */
  function checkPairBudget(a: string, b: string, t: number): number {
    const key = getPairKey(a, b)
    const entry = pairCollisionCounts.get(key)
    if (!entry || t - entry.windowStart > PAIR_WINDOW) {
      // Window reset — unsuppress the pair
      suppressedPairs.delete(key)
      pairCollisionCounts.set(key, { count: 1, windowStart: t })
      return 0
    }
    entry.count++
    if (entry.count > PAIR_BUDGET * 2) {
      suppressedPairs.add(key)
      return 2
    }
    if (entry.count > PAIR_BUDGET) return 1
    return 0
  }

  /** Build an exclude set for recompute: all balls suppressed with the given ball */
  function getSuppressedNeighbors(ballId: string): Set<string> | undefined {
    let result: Set<string> | undefined
    for (const key of suppressedPairs) {
      const sep = key.indexOf('\0')
      const id1 = key.substring(0, sep)
      const id2 = key.substring(sep + 1)
      if (id1 === ballId || id2 === ballId) {
        if (!result) result = new Set()
        result.add(id1 === ballId ? id2 : id1)
      }
    }
    return result
  }

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
      ball.clampToBounds(tableWidth, tableHeight)

      ball.updateTrajectory(profile, physicsConfig)
      currentTime = stateEvent.time

      if (debug) assertAllBalls(circles, tableWidth, tableHeight, `after StateTransition at t=${currentTime}`)

      replay.push({
        time: currentTime,
        type: EventType.StateTransition,
        snapshots: [snapshotBall(ball)],
      })

      collisionFinder.recompute(ball.id, getSuppressedNeighbors(ball.id))
      continue
    }

    // Collision event — advance and clamp (trajectory evaluation can overshoot walls)
    for (const circle of event.circles) {
      circle.advanceTime(event.time)
      circle.clampToBounds(tableWidth, tableHeight)
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
      // Ball-ball collision — solve full contact cluster simultaneously
      const c1 = event.circles[0]
      const c2 = event.circles[1]

      // Pair rate limiting safety net: suppress truly pathological pairs
      const pairTier = checkPairBudget(c1.id, c2.id, event.time)

      if (pairTier === 2) {
        // Way over budget — suppress pair globally until window expires
        c1.updateTrajectory(profile, physicsConfig)
        c2.updateTrajectory(profile, physicsConfig)
        c1.clampToBounds(tableWidth, tableHeight)
        c2.clampToBounds(tableWidth, tableHeight)
        c1.syncTrajectoryOrigin()
        c2.syncTrajectoryOrigin()
        currentTime = event.time

        collisionFinder.recompute(c1.id, getSuppressedNeighbors(c1.id))
        collisionFinder.recompute(c2.id, getSuppressedNeighbors(c2.id))
        continue
      }

      // Solve the full contact cluster (primary pair + all touching neighbors)
      const clusterResult = solveContactCluster(
        [c1, c2],
        collisionFinder.spatialGrid,
        profile,
        physicsConfig,
        event.time,
        tableWidth,
        tableHeight,
      )

      currentTime = event.time

      // Record all collision events from the cluster solve
      for (const replayEvent of clusterResult.replayEvents) {
        replay.push(replayEvent)
      }

      // Recompute for ALL affected balls
      for (const ball of clusterResult.affectedBalls) {
        collisionFinder.recompute(ball.id, getSuppressedNeighbors(ball.id))
      }

      if (debug) assertAllBalls(circles, tableWidth, tableHeight, `after CircleCollision at t=${currentTime}`)
      continue
    }

    // Clamp non-airborne balls that may have drifted past table bounds while airborne
    for (const circle of event.circles) {
      if (circle.motionState !== MotionState.Airborne) {
        circle.clampToBounds(tableWidth, tableHeight)
      }
    }

    currentTime = event.time

    if (debug) assertAllBalls(circles, tableWidth, tableHeight, `after Cushion at t=${currentTime}`)

    const replayData: ReplayData = {
      time: currentTime,
      type: event.type === 'Cushion' ? EventType.CushionCollision : EventType.CircleCollision,
      cushionType: (event as CushionCollision).cushion,
      snapshots: event.circles.map(snapshotBall),
    }

    replay.push(replayData)

    for (const circle of event.circles) {
      collisionFinder.recompute(circle.id, getSuppressedNeighbors(circle.id))
    }
  }
  return replay
}
