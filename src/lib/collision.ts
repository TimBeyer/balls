import Circle from './circle'
import { MinHeap } from './min-heap'
import { SpatialGrid } from './spatial-grid'

export enum Cushion {
  North = 'NORTH',
  East = 'EAST',
  South = 'SOUTH',
  West = 'WEST',
}

export interface Collision {
  type: 'Circle' | 'Cushion'
  circles: Circle[]
  /** Absolute time when this collision is predicted to occur */
  time: number
  /** Snapshot of each circle's epoch at event creation. If any circle's current
   *  epoch differs from its recorded value, the event is stale and should be skipped.
   *  See `isEventValid()` and the epoch-based invalidation docs in docs/ARCHITECTURE.md. */
  epochs: number[]
  /** Sequence number for deterministic heap ordering. The heap sorts by (time, seq)
   *  so events with identical times are processed in insertion order. */
  seq: number
}

export interface CircleCollision extends Collision {
  type: 'Circle'
}

export interface CushionCollision extends Collision {
  type: 'Cushion'
  cushion: Cushion
}

/** Scheduled when a circle is predicted to cross into an adjacent spatial grid cell.
 *  Not returned by pop() — processed internally to update the grid and discover new neighbors. */
export interface CellTransitionEvent {
  type: 'CellTransition'
  time: number
  circles: [Circle]
  toCell: number
  epochs: [number]
  seq: number
}

export type TreeEvent = Collision | CellTransitionEvent

const CUSHIONS = [Cushion.North, Cushion.East, Cushion.South, Cushion.West] as const

export function getCushionCollision(tableWidth: number, tableHeight: number, circle: Circle): CushionCollision {
  const px = circle.position[0]
  const py = circle.position[1]
  const vx = circle.velocity[0]
  const vy = circle.velocity[1]
  const r = circle.radius

  // Inline boundary crossing: compute time to each wall, pick earliest positive.
  // Avoids allocating LinearBoundary objects and arrays on every call.
  let minDt = Infinity
  let bestIdx = 0
  let dt: number

  dt = (tableHeight - r - py) / vy // North
  if (dt > Number.EPSILON && dt < minDt) { minDt = dt; bestIdx = 0 }
  dt = (tableWidth - r - px) / vx // East
  if (dt > Number.EPSILON && dt < minDt) { minDt = dt; bestIdx = 1 }
  dt = (r - py) / vy // South
  if (dt > Number.EPSILON && dt < minDt) { minDt = dt; bestIdx = 2 }
  dt = (r - px) / vx // West
  if (dt > Number.EPSILON && dt < minDt) { minDt = dt; bestIdx = 3 }

  return {
    type: 'Cushion',
    circles: [circle],
    cushion: CUSHIONS[bestIdx],
    time: minDt + circle.time,
    epochs: [circle.epoch],
    seq: 0,
  }
}

export function getCircleCollisionTime(circleA: Circle, circleB: Circle): number | undefined {
  const v1 = circleA.velocity
  const v2 = circleB.velocity

  // Project both circles to the later of their two times.
  // Inlined positionAtTime() to avoid allocating two Vector2D tuples per pair check.
  const refTime = Math.max(circleA.time, circleB.time)
  const dtA = refTime - circleA.time
  const dtB = refTime - circleB.time
  const posAx = circleA.position[0] + v1[0] * dtA
  const posAy = circleA.position[1] + v1[1] * dtA
  const posBx = circleB.position[0] + v2[0] * dtB
  const posBy = circleB.position[1] + v2[1] * dtB

  const radiusA = circleA.radius
  const radiusB = circleB.radius

  // Relative-frame collision detection: treat one circle as stationary,
  // solve quadratic for when center distance equals r1 + r2.
  const vx = v1[0] - v2[0]
  const vy = v1[1] - v2[1]
  const posX = posAx - posBx
  const posY = posAy - posBy

  // if the circles are already colliding, do not detect it
  const distanceSquared = posX * posX + posY * posY
  const distance = Math.sqrt(distanceSquared)
  if (distance < radiusA + radiusB) {
    return undefined
  }

  // preparing for `ax^2 + bx + x = 0` solution

  // a = (vx^2 + vy^2)
  const a = vx * vx + vy * vy
  const r = radiusA + radiusB

  // b = 2 (a*vx + b*vy)
  const b = 2 * (posX * vx + posY * vy)
  // c = a^2 + b^2 - (r1 + r2) ^ 2
  const c = distanceSquared - r * r

  // the part +- sqrt(b^2 - 4ac)
  const sqrtPart = Math.sqrt(b * b - 4 * a * c)
  const divisor = 2 * a

  const res1 = (-b + sqrtPart) / divisor
  const res2 = (-b - sqrtPart) / divisor

  if (res1 < res2) {
    if (!isNaN(res1) && res1 > 0) {
      return res1 + refTime
    }
  } else {
    if (!isNaN(res2) && res2 > 0) {
      return res2 + refTime
    }
  }

  return undefined
}

/**
 * Checks whether an event is still valid by comparing each circle's current epoch
 * to the epoch recorded when the event was created. If any circle has been involved
 * in a collision since then (epoch incremented), the event's prediction is based on
 * outdated velocity/position and must be discarded.
 */
function isEventValid(event: TreeEvent): boolean {
  for (let i = 0; i < event.circles.length; i++) {
    if (event.circles[i].epoch !== event.epochs[i]) return false
  }
  return true
}

/**
 * Manages all predicted collision events using an RBTree priority queue and a
 * spatial grid for neighbor lookups.
 *
 * ## Epoch-based lazy invalidation
 *
 * When a collision fires, the involved circles' velocities change, invalidating
 * any pending events that assumed the old trajectories. Rather than eagerly
 * searching the tree and removing every affected event (the old RelationStore
 * approach — O(k log n) per collision), we use a lazy scheme:
 *
 * 1. Each Circle has a monotonic `epoch` counter.
 * 2. Every event records the epoch of each involved circle at creation time.
 * 3. When pop() returns a collision, it increments the involved circles' epochs.
 * 4. Stale events (epoch mismatch) are detected and skipped in O(1) by pop().
 * 5. recompute() inserts fresh events stamped with the current epochs.
 *
 * Stale events remain in the tree but are drained naturally — each is popped
 * and discarded exactly once. The tree is somewhat larger than with eager
 * removal, but the per-collision cost drops from O(k log n) removals to O(1)
 * epoch increments.
 *
 * ## MinHeap seq tiebreaker
 *
 * Events are ordered by (time, seq). The `seq` tiebreaker ensures
 * deterministic ordering when multiple events share the same time (common:
 * recompute(A) and recompute(B) both predict A-B collision with the same
 * time since the quadratic is symmetric). Unlike the old RBTree, the heap
 * allows duplicates, so `seq` is not required for correctness — but it
 * preserves reproducible simulation results.
 */
export class CollisionFinder {
  private heap: MinHeap<TreeEvent>
  private tableWidth: number
  private tableHeight: number
  private circles: Circle[]
  private circlesById: Map<string, Circle> = new Map()
  private grid: SpatialGrid
  /** Monotonic counter ensuring deterministic event ordering */
  private nextSeq: number = 0

  constructor(tableWidth: number, tableHeight: number, circles: Circle[]) {
    this.heap = new MinHeap<TreeEvent>()
    this.tableWidth = tableWidth
    this.tableHeight = tableHeight
    this.circles = circles
    this.grid = new SpatialGrid(tableWidth, tableHeight, circles.length > 0 ? circles[0].radius * 4 : 150)

    this.initialize()
  }

  private initialize() {
    for (const circle of this.circles) {
      this.circlesById.set(circle.id, circle)
      this.grid.addCircle(circle)
    }

    for (const circle of this.circles) {
      const cushionCollision = getCushionCollision(this.tableWidth, this.tableHeight, circle)
      cushionCollision.seq = this.nextSeq++
      this.heap.push(cushionCollision)

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

      this.scheduleNextCellTransition(circle)
    }
  }

  private scheduleNextCellTransition(circle: Circle) {
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
   * Returns the next valid collision event in chronological order.
   * Stale events (epoch mismatch) and cell transitions are consumed internally.
   * After returning, the involved circles' epochs have been incremented —
   * the caller must then apply physics and call recompute() for each circle.
   */
  pop(): Collision {
    for (;;) {
      const next = this.heap.pop()!

      // Skip stale events whose circles have been involved in a collision
      // since this event was created (epoch mismatch)
      if (!isEventValid(next)) continue

      if (next.type === 'CellTransition') {
        const event = next as CellTransitionEvent
        const circle = event.circles[0]
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

      // Invalidate epochs for involved circles so their stale events are skipped
      for (const circle of next.circles) {
        circle.epoch++
      }

      return next as Collision
    }
  }

  /**
   * After a circle's velocity changes (collision response), predict its new
   * cushion collision, circle-circle collisions with spatial grid neighbors,
   * and next cell transition. All new events are stamped with current epochs.
   * Old events for this circle are not removed — they will be lazily skipped
   * via epoch mismatch in pop().
   */
  recompute(circleId: string) {
    const referenceCircle = this.circlesById.get(circleId)!

    const cushionCollision = getCushionCollision(this.tableWidth, this.tableHeight, referenceCircle)
    cushionCollision.seq = this.nextSeq++
    this.heap.push(cushionCollision)

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

    this.scheduleNextCellTransition(referenceCircle)
  }
}
