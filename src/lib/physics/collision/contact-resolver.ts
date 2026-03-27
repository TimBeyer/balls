/**
 * Contact Resolver — handles instant/simultaneous contact collisions.
 *
 * After the event queue fires a ball-ball collision, the involved balls may now
 * be touching other neighbors that should also collide at the same instant.
 * Instead of scheduling these through the event queue (where epoch invalidation
 * causes missed collisions), the ContactResolver handles them inline:
 *
 * 1. Check neighbors of just-resolved balls for contact + approaching
 * 2. Advance neighbor to current time, snap apart, resolve, update trajectories
 * 3. Repeat with newly-affected balls until no more contacts
 *
 * Convergence is guaranteed by:
 * - Pair tracking: after 2 resolutions of the same pair, force inelastic
 * - Max iterations: safety limit of totalBalls * 5
 */

import type Ball from '../../ball'
import type { SpatialGrid } from '../../spatial-grid'
import type { BallCollisionResolver } from './collision-resolver'
import type { PhysicsProfile } from '../physics-profile'
import type { PhysicsConfig } from '../../physics-config'
import type { MotionState } from '../../motion-state'
import { evaluateTrajectory, evaluateTrajectoryVelocity } from '../../trajectory'

/**
 * Tolerance for detecting contact (mm). Balls within rSum + CONTACT_TOL are "touching".
 * Must be small enough to only catch genuine simultaneous collisions (balls at exact
 * rSum distance), not future collisions that the heap will handle. Floating-point
 * evaluation of trajectories gives ~1e-8 mm precision, so 0.001mm is generous.
 */
const CONTACT_TOL = 0.001

/** Max resolutions of the same pair before forcing inelastic */
const MAX_PAIR_RESOLUTIONS = 2

/** Max resolutions of the same pair before skipping entirely (wall-locked pairs) */
const MAX_PAIR_SKIP = 4

export interface ContactSnapshot {
  id: string
  position: [number, number]
  velocity: [number, number]
  angularVelocity: [number, number, number]
  motionState: MotionState
  radius: number
  time: number
  trajectoryA: [number, number]
}

export interface ContactReplayEvent {
  time: number
  snapshots: ContactSnapshot[]
}

export interface ContactResult {
  /** All balls whose velocity/trajectory changed during contact resolution */
  affectedBalls: Ball[]
  /** Replay events for each resolved contact pair */
  replayEvents: ContactReplayEvent[]
}

function snapshotContact(ball: Ball): ContactSnapshot {
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
 * Compute a ball's position at a given absolute time using its trajectory.
 * Does NOT modify the ball's state.
 */
function positionAt(ball: Ball, t: number): [number, number] {
  const dt = t - ball.time
  if (dt === 0) return [ball.position[0], ball.position[1]]
  const pos = evaluateTrajectory(ball.trajectory, dt)
  return [pos[0], pos[1]]
}

/**
 * Compute a ball's velocity at a given absolute time using its trajectory.
 * Does NOT modify the ball's state.
 */
function velocityAt(ball: Ball, t: number): [number, number] {
  const dt = t - ball.time
  if (dt === 0) return [ball.velocity[0], ball.velocity[1]]
  const vel = evaluateTrajectoryVelocity(ball.trajectory, dt)
  return [vel[0], vel[1]]
}

/** Snap two balls to exact touching distance */
function snapApart(c1: Ball, c2: Ball): void {
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
}

/** Force inelastic resolution: set both balls to COM velocity along normal */
function forceInelastic(c1: Ball, c2: Ball): void {
  const dx = c1.position[0] - c2.position[0]
  const dy = c1.position[1] - c2.position[1]
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = dx / dist
  const ny = dy / dist

  const v1n = c1.velocity[0] * nx + c1.velocity[1] * ny
  const v2n = c2.velocity[0] * nx + c2.velocity[1] * ny
  const comVn = (c1.mass * v1n + c2.mass * v2n) / (c1.mass + c2.mass)

  c1.velocity[0] += (comVn - v1n) * nx
  c1.velocity[1] += (comVn - v1n) * ny
  c2.velocity[0] += (comVn - v2n) * nx
  c2.velocity[1] += (comVn - v2n) * ny
}

function makePairKey(a: string, b: string): string {
  return a < b ? a + '\0' + b : b + '\0' + a
}

/**
 * Advance a ball to the given time if it hasn't been advanced yet.
 * Rebases full trajectory (including acceleration direction) to match
 * current velocity. Safe here because updateTrajectory() and epoch++
 * happen on all affected balls after contact resolution completes.
 */
function ensureAdvanced(ball: Ball, t: number, profile: PhysicsProfile, config: PhysicsConfig): void {
  if (ball.time === t) return
  ball.advanceTime(t)
  ball.rebaseTrajectory(profile, config)
}

/**
 * Resolve all instant contact collisions cascading from an initial set of balls.
 *
 * Called after a ball-ball collision is resolved. Checks neighbors of the
 * involved balls for touching + approaching pairs and resolves them inline,
 * repeating until no more contacts exist.
 */
export function resolveContacts(
  triggerBalls: Ball[],
  totalBallCount: number,
  grid: SpatialGrid,
  resolver: BallCollisionResolver,
  profile: PhysicsProfile,
  config: PhysicsConfig,
  currentTime: number,
  tableWidth: number,
  tableHeight: number,
): ContactResult {
  const affectedSet = new Set<Ball>()
  const replayEvents: ContactReplayEvent[] = []
  const pairCount = new Map<string, number>()

  let dirtyBalls = new Set<Ball>(triggerBalls)
  let iterations = 0
  const maxIterations = totalBallCount * 5

  while (dirtyBalls.size > 0 && iterations < maxIterations) {
    iterations++
    const nextDirty = new Set<Ball>()

    for (const ball of dirtyBalls) {
      // Copy neighbor list — getNearbyCircles reuses an internal buffer
      const neighbors = [...grid.getNearbyCircles(ball)]

      for (const neighbor of neighbors) {
        // Compute neighbor's position and velocity at the current time
        // without modifying its state (it may not be involved in any contact)
        const nPos = positionAt(neighbor, currentTime)
        const nVel = velocityAt(neighbor, currentTime)

        // Distance check using ball's actual position (already at currentTime)
        // and neighbor's interpolated position
        const dx = ball.position[0] - nPos[0]
        const dy = ball.position[1] - nPos[1]
        const distSq = dx * dx + dy * dy
        const rSum = ball.radius + neighbor.radius
        const contactDist = rSum + CONTACT_TOL

        if (distSq > contactDist * contactDist) continue

        // Check if approaching (relative velocity dot relative position < 0)
        const relVx = ball.velocity[0] - nVel[0]
        const relVy = ball.velocity[1] - nVel[1]
        const approachDot = dx * relVx + dy * relVy
        if (approachDot >= 0) continue

        // This pair is touching and approaching — resolve it
        const pairKey = makePairKey(ball.id, neighbor.id)
        const count = (pairCount.get(pairKey) || 0) + 1
        pairCount.set(pairKey, count)

        // Skip pairs that have been resolved too many times (wall-locked / can't separate)
        if (count > MAX_PAIR_SKIP) continue

        // Advance neighbor to current time (modifies state + rebases trajectory)
        ensureAdvanced(neighbor, currentTime, profile, config)

        snapApart(ball, neighbor)

        if (count > MAX_PAIR_RESOLUTIONS) {
          // Oscillation detected — force inelastic to guarantee convergence
          forceInelastic(ball, neighbor)
        } else {
          resolver.resolve(ball, neighbor, config)
        }

        ball.updateTrajectory(profile, config)
        neighbor.updateTrajectory(profile, config)

        // Clamp to table bounds (auto-syncs trajectory origin)
        ball.clampToBounds(tableWidth, tableHeight)
        neighbor.clampToBounds(tableWidth, tableHeight)

        // After clamping, balls near walls may still overlap because the wall
        // prevented full separation. Iteratively push apart using half-overlap
        // (each iteration halves remaining overlap from wall-locked balls).
        for (let sep = 0; sep < 5; sep++) {
          const dx2 = ball.position[0] - neighbor.position[0]
          const dy2 = ball.position[1] - neighbor.position[1]
          const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
          const rSum2 = ball.radius + neighbor.radius
          if (dist2 <= 0 || dist2 >= rSum2) break
          const half2 = (rSum2 - dist2) / 2
          const nx2 = dx2 / dist2
          const ny2 = dy2 / dist2
          ball.position[0] += nx2 * half2
          ball.position[1] += ny2 * half2
          neighbor.position[0] -= nx2 * half2
          neighbor.position[1] -= ny2 * half2
          ball.clampToBounds(tableWidth, tableHeight)
          neighbor.clampToBounds(tableWidth, tableHeight)
        }

        // Final sync — clampToBounds auto-syncs when it clamps, but if no clamping
        // occurred we still need to sync after push-apart.
        ball.syncTrajectoryOrigin()
        neighbor.syncTrajectoryOrigin()

        // Increment epochs so old heap events for these balls are invalidated
        ball.epoch++
        neighbor.epoch++

        affectedSet.add(ball)
        affectedSet.add(neighbor)
        nextDirty.add(ball)
        nextDirty.add(neighbor)

        // Record replay event only for genuine resolutions, not forced convergence
        if (count <= MAX_PAIR_RESOLUTIONS) {
          replayEvents.push({
            time: currentTime,
            snapshots: [snapshotContact(ball), snapshotContact(neighbor)],
          })
        }
      }
    }

    dirtyBalls = nextDirty
  }

  return {
    affectedBalls: [...affectedSet],
    replayEvents,
  }
}
