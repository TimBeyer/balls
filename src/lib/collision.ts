import type Ball from './ball'
import { MinHeap } from './min-heap'
import { SpatialGrid } from './spatial-grid'
import { smallestPositiveRoot, solveQuadratic } from './polynomial-solver'
import type { PhysicsConfig } from './physics-config'
import { StateTransitionEvent, getStateTransitionTime } from './state-transitions'

export enum Cushion {
  North = 'NORTH',
  East = 'EAST',
  South = 'SOUTH',
  West = 'WEST',
}

export interface Collision {
  type: 'Circle' | 'Cushion'
  circles: Ball[]
  /** Absolute time when this collision is predicted to occur */
  time: number
  /** Snapshot of each circle's epoch at event creation. If any circle's current
   *  epoch differs from its recorded value, the event is stale and should be skipped. */
  epochs: number[]
  /** Sequence number for deterministic heap ordering. */
  seq: number
}

export interface CircleCollision extends Collision {
  type: 'Circle'
}

export interface CushionCollision extends Collision {
  type: 'Cushion'
  cushion: Cushion
}

/** Scheduled when a circle is predicted to cross into an adjacent spatial grid cell. */
export interface CellTransitionEvent {
  type: 'CellTransition'
  time: number
  circles: [Ball]
  toCell: number
  epochs: [number]
  seq: number
}

export type TreeEvent = Collision | CellTransitionEvent | StateTransitionEvent

const CUSHIONS = [Cushion.North, Cushion.East, Cushion.South, Cushion.West] as const

/**
 * Compute earliest cushion collision for a ball with quadratic trajectory.
 * For axis-aligned cushions, solve: a*t^2 + b*t + (c - wall) = 0
 */
export function getCushionCollision(tableWidth: number, tableHeight: number, circle: Ball): CushionCollision {
  const traj = circle.trajectory
  const r = circle.radius

  let minDt = Infinity
  let bestIdx = 0

  // For each wall, find the smallest positive dt where the trajectory intersects.
  // "Return" collisions (ball decelerates, reverses, comes back) are handled by
  // epoch-based invalidation — state transitions fire first and make them stale.

  // North wall: y = tableHeight - r
  const northRoots = solveQuadratic(traj.a[1], traj.b[1], traj.c[1] - (tableHeight - r))
  for (const dt of northRoots) {
    if (dt > Number.EPSILON && dt < minDt) {
      minDt = dt
      bestIdx = 0
    }
  }

  // East wall: x = tableWidth - r
  const eastRoots = solveQuadratic(traj.a[0], traj.b[0], traj.c[0] - (tableWidth - r))
  for (const dt of eastRoots) {
    if (dt > Number.EPSILON && dt < minDt) {
      minDt = dt
      bestIdx = 1
    }
  }

  // South wall: y = r
  const southRoots = solveQuadratic(traj.a[1], traj.b[1], traj.c[1] - r)
  for (const dt of southRoots) {
    if (dt > Number.EPSILON && dt < minDt) {
      minDt = dt
      bestIdx = 2
    }
  }

  // West wall: x = r
  const westRoots = solveQuadratic(traj.a[0], traj.b[0], traj.c[0] - r)
  for (const dt of westRoots) {
    if (dt > Number.EPSILON && dt < minDt) {
      minDt = dt
      bestIdx = 3
    }
  }

  return {
    type: 'Cushion',
    circles: [circle],
    cushion: CUSHIONS[bestIdx],
    time: minDt + circle.time,
    epochs: [circle.epoch],
    seq: 0,
  }
}

/**
 * Compute ball-ball collision time using quartic polynomial.
 *
 * With quadratic trajectories r_i(t) = a_i*t^2 + b_i*t + c_i,
 * the distance vector d(t) = r_j(t) - r_i(t) = A*t^2 + B*t + C
 * where A, B, C are differences of trajectory coefficients.
 *
 * Collision when |d(t)|^2 = (R_i + R_j)^2 yields a quartic polynomial.
 *
 * Both balls' trajectories are re-referenced to a common time (the later of the two).
 */
export function getCircleCollisionTime(circleA: Ball, circleB: Ball): number | undefined {
  // Project both trajectories to the later of their two times
  const refTime = Math.max(circleA.time, circleB.time)
  const dtA = refTime - circleA.time
  const dtB = refTime - circleB.time

  // Evaluate trajectory coefficients at refTime
  // For ball A: position at refTime is a_A*dtA^2 + b_A*dtA + c_A
  // New trajectory from refTime: a_A * (t')^2 + (2*a_A*dtA + b_A)*t' + (a_A*dtA^2 + b_A*dtA + c_A)
  const trajA = circleA.trajectory
  const trajB = circleB.trajectory

  const rebaseA = rebaseTrajectory(trajA, dtA)
  const rebaseB = rebaseTrajectory(trajB, dtB)

  // Difference: d(t) = B(t) - A(t) = (aB-aA)*t^2 + (bB-bA)*t + (cB-cA)
  const Ax = rebaseB.a0 - rebaseA.a0
  const Ay = rebaseB.a1 - rebaseA.a1
  const Az = rebaseB.a2 - rebaseA.a2
  const Bx = rebaseB.b0 - rebaseA.b0
  const By = rebaseB.b1 - rebaseA.b1
  const Bz = rebaseB.b2 - rebaseA.b2
  const Cx = rebaseB.c0 - rebaseA.c0
  const Cy = rebaseB.c1 - rebaseA.c1
  const Cz = rebaseB.c2 - rebaseA.c2

  // Check if already overlapping
  const distSq = Cx * Cx + Cy * Cy + Cz * Cz
  const rSum = circleA.radius + circleB.radius
  if (distSq < rSum * rSum) return undefined

  // |d(t)|^2 = (Ri+Rj)^2 expands to quartic:
  // coeff4 * t^4 + coeff3 * t^3 + coeff2 * t^2 + coeff1 * t + coeff0 = 0
  const coeff4 = Ax * Ax + Ay * Ay + Az * Az
  const coeff3 = 2 * (Ax * Bx + Ay * By + Az * Bz)
  const coeff2 = Bx * Bx + By * By + Bz * Bz + 2 * (Ax * Cx + Ay * Cy + Az * Cz)
  const coeff1 = 2 * (Bx * Cx + By * Cy + Bz * Cz)
  const coeff0 = Cx * Cx + Cy * Cy + Cz * Cz - rSum * rSum

  const dt = smallestPositiveRoot([coeff4, coeff3, coeff2, coeff1, coeff0])
  if (dt === undefined) return undefined

  return dt + refTime
}

/** Rebase trajectory coefficients to a new origin time offset by dt */
function rebaseTrajectory(
  traj: { a: [number, number, number]; b: [number, number, number]; c: [number, number, number] },
  dt: number,
) {
  if (dt === 0) {
    return {
      a0: traj.a[0], a1: traj.a[1], a2: traj.a[2],
      b0: traj.b[0], b1: traj.b[1], b2: traj.b[2],
      c0: traj.c[0], c1: traj.c[1], c2: traj.c[2],
    }
  }
  // r(t + dt) = a*(t+dt)^2 + b*(t+dt) + c
  //           = a*t^2 + (2*a*dt + b)*t + (a*dt^2 + b*dt + c)
  const dt2 = dt * dt
  return {
    a0: traj.a[0], a1: traj.a[1], a2: traj.a[2],
    b0: 2 * traj.a[0] * dt + traj.b[0],
    b1: 2 * traj.a[1] * dt + traj.b[1],
    b2: 2 * traj.a[2] * dt + traj.b[2],
    c0: traj.a[0] * dt2 + traj.b[0] * dt + traj.c[0],
    c1: traj.a[1] * dt2 + traj.b[1] * dt + traj.c[1],
    c2: traj.a[2] * dt2 + traj.b[2] * dt + traj.c[2],
  }
}

/**
 * Checks whether an event is still valid by comparing each circle's current epoch
 * to the epoch recorded when the event was created.
 */
function isEventValid(event: TreeEvent): boolean {
  for (let i = 0; i < event.circles.length; i++) {
    if (event.circles[i].epoch !== event.epochs[i]) return false
  }
  return true
}

/**
 * Manages all predicted collision and state transition events using a min-heap
 * priority queue and a spatial grid for neighbor lookups.
 *
 * ## Epoch-based lazy invalidation
 *
 * When a collision fires, the involved circles' velocities change, invalidating
 * any pending events that assumed the old trajectories. Rather than eagerly
 * searching the heap and removing every affected event, we use a lazy scheme:
 *
 * 1. Each Ball has a monotonic `epoch` counter.
 * 2. Every event records the epoch of each involved ball at creation time.
 * 3. When pop() returns a collision, it increments the involved balls' epochs.
 * 4. Stale events (epoch mismatch) are detected and skipped in O(1) by pop().
 * 5. recompute() inserts fresh events stamped with the current epochs.
 */
export class CollisionFinder {
  private heap: MinHeap<TreeEvent>
  private tableWidth: number
  private tableHeight: number
  private circles: Ball[]
  private circlesById: Map<string, Ball> = new Map()
  private grid: SpatialGrid
  private physicsConfig: PhysicsConfig
  /** Monotonic counter ensuring deterministic event ordering */
  private nextSeq: number = 0

  constructor(tableWidth: number, tableHeight: number, circles: Ball[], physicsConfig: PhysicsConfig) {
    this.heap = new MinHeap<TreeEvent>()
    this.tableWidth = tableWidth
    this.tableHeight = tableHeight
    this.circles = circles
    this.physicsConfig = physicsConfig
    this.grid = new SpatialGrid(tableWidth, tableHeight, circles.length > 0 ? circles[0].radius * 4 : 150)

    this.initialize()
  }

  private initialize() {
    for (const circle of this.circles) {
      this.circlesById.set(circle.id, circle)
      this.grid.addCircle(circle)
    }

    for (const circle of this.circles) {
      this.scheduleAllEvents(circle)
    }
  }

  /** Schedule cushion, ball-ball, state transition, and cell transition events for a ball */
  private scheduleAllEvents(circle: Ball, skipBallBall = false) {
    // Cushion collision
    const cushionCollision = getCushionCollision(this.tableWidth, this.tableHeight, circle)
    cushionCollision.seq = this.nextSeq++
    this.heap.push(cushionCollision)

    // Ball-ball collisions with neighbors
    if (!skipBallBall) {
      const neighbors = this.grid.getNearbyCircles(circle)
      for (const neighbor of neighbors) {
        if (circle.id >= neighbor.id) continue
        const time = getCircleCollisionTime(circle, neighbor)
        if (time) {
          const collision: Collision = {
            type: 'Circle',
            time,
            circles: [circle, neighbor],
            epochs: [circle.epoch, neighbor.epoch],
            seq: this.nextSeq++,
          }
          this.heap.push(collision)
        }
      }
    }

    // State transition
    const transition = getStateTransitionTime(circle, this.physicsConfig)
    if (transition) {
      const stateEvent: StateTransitionEvent = {
        ...transition,
        seq: this.nextSeq++,
      }
      this.heap.push(stateEvent)
    }

    // Cell transition
    this.scheduleNextCellTransition(circle)
  }

  private scheduleNextCellTransition(circle: Ball) {
    const transition = this.grid.getNextCellTransition(circle)
    if (transition) {
      const event: CellTransitionEvent = {
        type: 'CellTransition',
        time: transition.time,
        circles: [circle],
        toCell: transition.toCell,
        epochs: [circle.epoch],
        seq: this.nextSeq++,
      }
      this.heap.push(event)
    }
  }

  /**
   * Returns the next valid event (collision or state transition) in chronological order.
   * Stale events (epoch mismatch) and cell transitions are consumed internally.
   * After returning a collision, the involved circles' epochs have been incremented —
   * the caller must then apply physics and call recompute() for each circle.
   * State transition events are also returned so the caller can record them.
   */
  pop(): Collision | StateTransitionEvent {
    for (;;) {
      const next = this.heap.pop()!

      if (!isEventValid(next)) continue

      if (next.type === 'CellTransition') {
        const event = next as CellTransitionEvent
        const circle = event.circles[0]

        // Advance circle to transition time and rebase trajectory to new reference point.
        // Do NOT call updateTrajectory — that re-determines motion state, which could
        // prematurely switch e.g. Sliding→Rolling and corrupt collision detection.
        circle.advanceTime(event.time)
        circle.trajectory.c = [circle.position[0], circle.position[1], circle.position[2]]
        circle.trajectory.b = [circle.velocity[0], circle.velocity[1], circle.velocity[2]]
        // trajectory.a stays the same (acceleration unchanged within a motion state)
        circle.angularTrajectory.omega0 = [
          circle.angularVelocity[0],
          circle.angularVelocity[1],
          circle.angularVelocity[2],
        ]
        // angularTrajectory.alpha stays the same

        this.grid.moveCircle(circle, event.toCell)
        this.scheduleNextCellTransition(circle)

        const neighbors = this.grid.getNearbyCircles(circle)
        for (const neighbor of neighbors) {
          const time = getCircleCollisionTime(circle, neighbor)
          if (time) {
            const collision: Collision = {
              type: 'Circle',
              time,
              circles: [circle, neighbor],
              epochs: [circle.epoch, neighbor.epoch],
              seq: this.nextSeq++,
            }
            this.heap.push(collision)
          }
        }
        continue
      }

      if (next.type === 'StateTransition') {
        // State transitions: increment epoch and return to caller
        for (const circle of next.circles) {
          circle.epoch++
        }
        return next as StateTransitionEvent
      }

      // Collision event: invalidate epochs for involved circles
      for (const circle of next.circles) {
        circle.epoch++
      }

      return next as Collision
    }
  }

  /**
   * After a circle's velocity/state changes, predict its new events.
   * Old events for this circle are not removed — they will be lazily skipped
   * via epoch mismatch in pop().
   */
  recompute(circleId: string) {
    const referenceCircle = this.circlesById.get(circleId)!

    // Cushion collision
    const cushionCollision = getCushionCollision(this.tableWidth, this.tableHeight, referenceCircle)
    cushionCollision.seq = this.nextSeq++
    this.heap.push(cushionCollision)

    // Ball-ball collisions with neighbors
    const neighbors = this.grid.getNearbyCircles(referenceCircle)
    for (const neighbor of neighbors) {
      const time = getCircleCollisionTime(referenceCircle, neighbor)
      if (time) {
        const collision: Collision = {
          type: 'Circle',
          time,
          circles: [referenceCircle, neighbor],
          epochs: [referenceCircle.epoch, neighbor.epoch],
          seq: this.nextSeq++,
        }
        this.heap.push(collision)
      }
    }

    // State transition
    const transition = getStateTransitionTime(referenceCircle, this.physicsConfig)
    if (transition) {
      const stateEvent: StateTransitionEvent = {
        ...transition,
        seq: this.nextSeq++,
      }
      this.heap.push(stateEvent)
    }

    this.scheduleNextCellTransition(referenceCircle)
  }
}
