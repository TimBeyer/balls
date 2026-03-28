/**
 * Contact Cluster Solver — simultaneous constraint-based collision resolution.
 *
 * When a ball-ball collision fires, this solver:
 * 1. Builds a contact graph via BFS (all balls within touching distance)
 * 2. Solves all contact constraints simultaneously using sequential impulse (Gauss-Seidel)
 * 3. Applies results atomically — trajectories updated once for all balls
 *
 * This replaces both ElasticBallResolver (for the primary pair) and resolveContacts()
 * (for cascade contacts). The solver handles clusters of any shape (chains, diamonds,
 * triangles) correctly because all contact normals are considered simultaneously.
 *
 * Restitution uses the physical per-ball eBallBall parameter (averaged between pairs),
 * with an inelastic floor at V_LOW to prevent micro-speed Zeno cascades.
 *
 * Sequential impulse convergence is guaranteed by accumulated impulse clamping
 * (impulses can only push balls apart, never pull) and a fixed iteration limit.
 */

import type Ball from '../../ball'
import type { SpatialGrid } from '../../spatial-grid'
import type { PhysicsProfile } from '../physics-profile'
import type { PhysicsConfig } from '../../physics-config'
import type { ReplayData, CircleSnapshot } from '../../simulation'
import { EventType } from '../../simulation'

/** Approach speed (mm/s) below which e=0 (perfectly inelastic) */
const V_LOW = 5

/** Tolerance for detecting contact (mm). Balls within rSum + CONTACT_TOL are "touching".
 *  Must be larger than scenario gaps (e.g. 0.1mm in Newton's cradle) so the solver
 *  discovers the full chain and resolves it simultaneously. */
const CONTACT_TOL = 0.001

/** Maximum Gauss-Seidel iterations */
const MAX_ITERATIONS = 20

/** Velocity convergence threshold (mm/s) */
const CONVERGENCE_TOL = 0.01

/** Safety cap on cluster size — fall back to inelastic if exceeded */
const MAX_CLUSTER_SIZE = 200

interface ContactConstraint {
  ballA: Ball
  ballB: Ball
  normal: [number, number]
  restitution: number
  targetSeparatingSpeed: number
  accumulatedImpulse: number
}

export interface ClusterResult {
  affectedBalls: Ball[]
  replayEvents: ReplayData[]
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
    trajectoryMaxDt: ball.trajectory.maxDt,
  }
}

/** Snap two balls to exact touching distance along the line of centers */
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

function makePairKey(a: string, b: string): string {
  return a < b ? a + '\0' + b : b + '\0' + a
}

/**
 * Solve all contact constraints in a cluster simultaneously.
 *
 * Called after a ball-ball collision event fires. The trigger balls (the primary
 * collision pair) are already advanced to currentTime by the caller. This function:
 * 1. Discovers all balls in the contact cluster (BFS via spatial grid)
 * 2. Snaps all contact pairs to exact touching distance
 * 3. Runs sequential impulse solver to convergence
 * 4. Updates trajectories for all affected balls
 */
export function solveContactCluster(
  triggerBalls: Ball[],
  grid: SpatialGrid,
  profile: PhysicsProfile,
  config: PhysicsConfig,
  currentTime: number,
  tableWidth: number,
  tableHeight: number,
): ClusterResult {
  // Phase 1: Build contact graph via BFS — discover all touching balls
  const visited = new Set<string>()
  const queue: Ball[] = []
  const clusterBalls: Ball[] = []
  // Track contact pairs as [ballA, ballB] for constraint creation after snap-apart
  const contactPairs: [Ball, Ball][] = []
  const pairKeys = new Set<string>()

  for (const b of triggerBalls) {
    if (!visited.has(b.id)) {
      visited.add(b.id)
      queue.push(b)
    }
  }

  while (queue.length > 0) {
    const ball = queue.shift()!
    clusterBalls.push(ball)

    // Safety: don't let cluster grow unbounded
    if (clusterBalls.length > MAX_CLUSTER_SIZE) break

    // Copy neighbor list — getNearbyCircles reuses an internal buffer
    const neighbors = [...grid.getNearbyCircles(ball)]

    for (const neighbor of neighbors) {
      // Compute neighbor's position at currentTime without modifying state
      const ndt = currentTime - neighbor.time
      let nPosX: number, nPosY: number
      if (ndt === 0) {
        nPosX = neighbor.position[0]
        nPosY = neighbor.position[1]
      } else {
        nPosX = neighbor.trajectory.a[0] * ndt * ndt + neighbor.trajectory.b[0] * ndt + neighbor.trajectory.c[0]
        nPosY = neighbor.trajectory.a[1] * ndt * ndt + neighbor.trajectory.b[1] * ndt + neighbor.trajectory.c[1]
      }

      const dx = nPosX - ball.position[0]
      const dy = nPosY - ball.position[1]
      const distSq = dx * dx + dy * dy
      const rSum = ball.radius + neighbor.radius
      const contactDist = rSum + CONTACT_TOL

      if (distSq > contactDist * contactDist) continue

      // This neighbor is in contact — advance it to current time if not yet visited
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id)
        if (neighbor.time !== currentTime) {
          neighbor.advanceTime(currentTime)
          neighbor.clampToBounds(tableWidth, tableHeight)
          neighbor.rebaseTrajectory(profile, config)
        }
        queue.push(neighbor)
      }

      // Record contact pair (avoid duplicates)
      const pairKey = makePairKey(ball.id, neighbor.id)
      if (pairKeys.has(pairKey)) continue
      pairKeys.add(pairKey)
      contactPairs.push([ball, neighbor])
    }
  }

  // Phase 1b: Snap all contact pairs to exact touching distance
  // Iterate because snapping one pair can push balls into others
  for (let snapIter = 0; snapIter < 5; snapIter++) {
    let anyOverlap = false
    for (const [a, b] of contactPairs) {
      const dx = a.position[0] - b.position[0]
      const dy = a.position[1] - b.position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const rSum = a.radius + b.radius
      if (dist > 0 && dist < rSum - 1e-6) {
        snapApart(a, b)
        anyOverlap = true
      }
    }
    if (!anyOverlap) break
  }

  // Phase 1c: Build constraints from snapped positions (only approaching pairs)
  const constraints: ContactConstraint[] = []

  for (const [ball, neighbor] of contactPairs) {
    // Compute contact normal from snapped positions (ball → neighbor)
    const cdx = neighbor.position[0] - ball.position[0]
    const cdy = neighbor.position[1] - ball.position[1]
    const cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 1
    const nx = cdx / cdist
    const ny = cdy / cdist

    // Relative normal velocity (positive = separating)
    const vRelN =
      (neighbor.velocity[0] - ball.velocity[0]) * nx + (neighbor.velocity[1] - ball.velocity[1]) * ny

    // Only approaching pairs need impulse resolution
    if (vRelN >= 0) continue

    const approachSpeed = -vRelN

    // Restitution: physical eBallBall averaged between both balls,
    // with inelastic floor below V_LOW
    const e = approachSpeed <= V_LOW ? 0 : (ball.physicsParams.eBallBall + neighbor.physicsParams.eBallBall) / 2

    constraints.push({
      ballA: ball,
      ballB: neighbor,
      normal: [nx, ny],
      restitution: e,
      targetSeparatingSpeed: e * approachSpeed,
      accumulatedImpulse: 0,
    })
  }

  // Phase 2: Sequential impulse solver (Gauss-Seidel)
  if (constraints.length > 0) {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let maxDelta = 0

      for (const c of constraints) {
        const { ballA, ballB, normal } = c

        // Current relative normal velocity
        const vRelN =
          (ballB.velocity[0] - ballA.velocity[0]) * normal[0] + (ballB.velocity[1] - ballA.velocity[1]) * normal[1]

        // How far are we from the target?
        const desiredDeltaV = c.targetSeparatingSpeed - vRelN
        if (desiredDeltaV <= CONVERGENCE_TOL) continue

        // Effective mass along normal
        const mEff = 1 / (1 / ballA.mass + 1 / ballB.mass)
        const J = mEff * desiredDeltaV

        // Clamp accumulated impulse ≥ 0 (can only push apart, never pull)
        const newAccum = Math.max(0, c.accumulatedImpulse + J)
        const JApplied = newAccum - c.accumulatedImpulse
        c.accumulatedImpulse = newAccum

        if (JApplied < 1e-12) continue

        // Apply impulse to velocities
        const jOverMa = JApplied / ballA.mass
        const jOverMb = JApplied / ballB.mass
        ballA.velocity[0] -= jOverMa * normal[0]
        ballA.velocity[1] -= jOverMa * normal[1]
        ballB.velocity[0] += jOverMb * normal[0]
        ballB.velocity[1] += jOverMb * normal[1]

        maxDelta = Math.max(maxDelta, JApplied / Math.min(ballA.mass, ballB.mass))
      }

      if (maxDelta < CONVERGENCE_TOL) break
    }
  }

  // Phase 3: Apply results atomically
  // Affected = trigger balls (always) + any ball that received an impulse
  const affectedBallSet = new Set<Ball>(triggerBalls)
  for (const c of constraints) {
    if (c.accumulatedImpulse > 1e-12) {
      affectedBallSet.add(c.ballA)
      affectedBallSet.add(c.ballB)
    }
  }
  const affectedBalls = [...affectedBallSet]

  // Zero z-velocity and update trajectories only for affected balls
  for (const ball of affectedBalls) {
    ball.velocity[2] = 0
    ball.updateTrajectory(profile, config)
    ball.clampToBounds(tableWidth, tableHeight)
  }

  // Iterative push-apart for wall-locked pairs (only constraints that fired)
  for (const c of constraints) {
    if (c.accumulatedImpulse <= 1e-12) continue
    for (let sep = 0; sep < 5; sep++) {
      const dx = c.ballA.position[0] - c.ballB.position[0]
      const dy = c.ballA.position[1] - c.ballB.position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const rSum = c.ballA.radius + c.ballB.radius
      if (dist <= 0 || dist >= rSum) break
      const half = (rSum - dist) / 2
      const nx = dx / dist
      const ny = dy / dist
      c.ballA.position[0] += nx * half
      c.ballA.position[1] += ny * half
      c.ballB.position[0] -= nx * half
      c.ballB.position[1] -= ny * half
      c.ballA.clampToBounds(tableWidth, tableHeight)
      c.ballB.clampToBounds(tableWidth, tableHeight)
    }
  }

  // Final overlap resolution: check ALL pairs in the cluster (not just constraints)
  // and push apart any remaining overlaps. This catches overlaps created by
  // trajectory updates and wall clamping.
  for (let overlapIter = 0; overlapIter < 3; overlapIter++) {
    let anyOverlap = false
    for (const [a, b] of contactPairs) {
      const dx = a.position[0] - b.position[0]
      const dy = a.position[1] - b.position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const rSum = a.radius + b.radius
      if (dist > 0 && dist < rSum - 1e-6) {
        const half = (rSum - dist) / 2
        const nx = dx / dist
        const ny = dy / dist
        a.position[0] += nx * half
        a.position[1] += ny * half
        b.position[0] -= nx * half
        b.position[1] -= ny * half
        a.clampToBounds(tableWidth, tableHeight)
        b.clampToBounds(tableWidth, tableHeight)
        anyOverlap = true
      }
    }
    if (!anyOverlap) break
  }

  // Final sync and epoch increment only for affected balls
  for (const ball of affectedBalls) {
    ball.syncTrajectoryOrigin()
    ball.epoch++
  }

  // Build replay events
  const replayEvents: ReplayData[] = []

  if (affectedBalls.length > 0) {
    replayEvents.push({
      time: currentTime,
      type: EventType.CircleCollision,
      snapshots: affectedBalls.map(snapshotBall),
    })
  }

  return {
    affectedBalls,
    replayEvents,
  }
}
