import type Ball from './ball'
import { MinHeap } from './min-heap'
import { SpatialGrid } from './spatial-grid'
import { MotionState } from './motion-state'
import type { PhysicsConfig } from './physics-config'
import type { PhysicsProfile } from './physics/physics-profile'

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

export interface StateTransitionEvent {
  type: 'StateTransition'
  time: number
  circles: [Ball]
  fromState: string
  toState: string
  epochs: [number]
  seq: number
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
 * Uses a PhysicsProfile for all detection and state transition logic,
 * making the event system physics-agnostic.
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
  private profile: PhysicsProfile
  /** Monotonic counter ensuring deterministic event ordering */
  private nextSeq: number = 0

  constructor(
    tableWidth: number,
    tableHeight: number,
    circles: Ball[],
    physicsConfig: PhysicsConfig,
    profile: PhysicsProfile,
  ) {
    this.heap = new MinHeap<TreeEvent>()
    this.tableWidth = tableWidth
    this.tableHeight = tableHeight
    this.circles = circles
    this.physicsConfig = physicsConfig
    this.profile = profile
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
    // Cushion collision (via detector from profile)
    const cushionCollision = this.profile.cushionDetector.detect(circle, this.tableWidth, this.tableHeight)
    cushionCollision.seq = this.nextSeq++
    this.heap.push(cushionCollision)

    // Ball-ball collisions with neighbors (via detector from profile)
    if (!skipBallBall) {
      const neighbors = this.grid.getNearbyCircles(circle)
      for (const neighbor of neighbors) {
        if (circle.id >= neighbor.id) continue
        const time = this.profile.ballBallDetector.detect(circle, neighbor)
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

    // State transition (via motion model from profile)
    this.scheduleStateTransition(circle)

    // Cell transition
    this.scheduleNextCellTransition(circle)
  }

  private scheduleStateTransition(circle: Ball) {
    const model = this.profile.motionModels.get(circle.motionState)
    if (!model) return

    const transition = model.getTransitionTime(circle, this.physicsConfig)
    if (transition) {
      const stateEvent: StateTransitionEvent = {
        type: 'StateTransition',
        time: circle.time + transition.dt,
        circles: [circle],
        fromState: circle.motionState,
        toState: transition.toState,
        epochs: [circle.epoch],
        seq: this.nextSeq++,
      }
      this.heap.push(stateEvent)
    }
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

        // Re-check ball-ball collisions with new neighbors (via profile detector)
        const neighbors = this.grid.getNearbyCircles(circle)
        for (const neighbor of neighbors) {
          const time = this.profile.ballBallDetector.detect(circle, neighbor)
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
   *
   * @param skipPairId — skip ball-ball detection against this ball (the ball we just
   *   collided with). After a collision, both balls are at touching distance and the
   *   Sliding acceleration can push them back together in nanoseconds, creating an
   *   infinite collision loop (Zeno / resting contact problem). The pair will be
   *   re-checked naturally when either ball's trajectory changes from a state transition
   *   or collision with another ball.
   */
  recompute(circleId: string, skipPairId?: string) {
    const referenceCircle = this.circlesById.get(circleId)!

    // Cushion collision (via detector from profile)
    // Airborne balls are above the table and don't interact with cushions
    if (referenceCircle.motionState !== MotionState.Airborne) {
      const cushionCollision = this.profile.cushionDetector.detect(
        referenceCircle,
        this.tableWidth,
        this.tableHeight,
      )
      cushionCollision.seq = this.nextSeq++
      this.heap.push(cushionCollision)
    }

    // Ball-ball collisions with neighbors (via detector from profile)
    const neighbors = this.grid.getNearbyCircles(referenceCircle)
    for (const neighbor of neighbors) {
      if (neighbor.id === skipPairId) continue
      const time = this.profile.ballBallDetector.detect(referenceCircle, neighbor)
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

    // State transition (via motion model from profile)
    this.scheduleStateTransition(referenceCircle)

    this.scheduleNextCellTransition(referenceCircle)
  }

}
