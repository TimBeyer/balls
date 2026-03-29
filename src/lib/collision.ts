import type Ball from './ball'
import { MinHeap } from './min-heap'
import { SpatialGrid } from './spatial-grid'
import { MotionState } from './motion-state'
import type { PhysicsConfig } from './physics-config'
import type { PhysicsProfile } from './physics/physics-profile'
import type { TableConfig } from './table-config'
import type { PocketDetector } from './physics/detection/pocket-detector'
import { QuarticPocketDetector } from './physics/detection/pocket-detector'
import { SegmentedCushionDetector } from './physics/detection/segmented-cushion-detector'

// Re-export Cushion from its own module (avoids circular dependency with detectors)
export { Cushion } from './cushion'
import { Cushion } from './cushion'

export interface Collision {
  type: 'Circle' | 'Cushion' | 'Pocket'
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

export interface PocketCollision {
  type: 'Pocket'
  circles: [Ball]
  time: number
  epochs: [number]
  seq: number
  pocketId: string
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

export type TreeEvent = Collision | PocketCollision | CellTransitionEvent | StateTransitionEvent

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
  private tableConfig: TableConfig | undefined
  private pocketDetector: PocketDetector | undefined
  private effectiveProfile: PhysicsProfile
  /** Monotonic counter ensuring deterministic event ordering */
  private nextSeq: number = 0

  /** Spatial grid for neighbor lookups — exposed for contact resolution */
  get spatialGrid(): SpatialGrid {
    return this.grid
  }

  constructor(
    tableWidth: number,
    tableHeight: number,
    circles: Ball[],
    physicsConfig: PhysicsConfig,
    profile: PhysicsProfile,
    tableConfig?: TableConfig,
  ) {
    this.heap = new MinHeap<TreeEvent>()
    this.tableWidth = tableWidth
    this.tableHeight = tableHeight
    this.circles = circles
    this.physicsConfig = physicsConfig
    this.profile = profile
    this.tableConfig = tableConfig
    this.grid = new SpatialGrid(tableWidth, tableHeight, circles.length > 0 ? circles[0].radius * 4 : 150)

    // If table has pockets, use segmented cushion detector and pocket detector
    if (tableConfig && tableConfig.pockets.length > 0) {
      this.pocketDetector = new QuarticPocketDetector()
      const segmentedDetector = new SegmentedCushionDetector(tableConfig.cushionSegments)
      this.effectiveProfile = {
        ...profile,
        cushionDetector: segmentedDetector,
      }
    } else {
      this.effectiveProfile = profile
    }

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

  /** Schedule cushion, ball-ball, pocket, state transition, and cell transition events for a ball */
  private scheduleAllEvents(circle: Ball, skipBallBall = false) {
    // Cushion collision (via detector from profile — may be segmented for pocket tables)
    const cushionCollision = this.effectiveProfile.cushionDetector.detect(circle, this.tableWidth, this.tableHeight)
    cushionCollision.seq = this.nextSeq++
    this.heap.push(cushionCollision)

    // Pocket detection (only for tables with pockets)
    this.schedulePocketEvents(circle)

    // Ball-ball collisions with neighbors (via detector from profile)
    if (!skipBallBall) {
      const neighbors = this.grid.getNearbyCircles(circle)
      for (const neighbor of neighbors) {
        if (circle.id >= neighbor.id) continue
        const time = this.effectiveProfile.ballBallDetector.detect(circle, neighbor)
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

  /** Schedule pocket entry events for a ball (if table has pockets) */
  private schedulePocketEvents(circle: Ball) {
    if (!this.pocketDetector || !this.tableConfig) return

    const result = this.pocketDetector.detect(circle, this.tableConfig.pockets)
    if (result) {
      const pocketEvent: PocketCollision = {
        type: 'Pocket',
        circles: [circle],
        time: result.time,
        epochs: [circle.epoch],
        seq: this.nextSeq++,
        pocketId: result.pocketId,
      }
      this.heap.push(pocketEvent)
    }
  }

  private scheduleStateTransition(circle: Ball) {
    const model = this.effectiveProfile.motionModels.get(circle.motionState)
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
  pop(): Collision | PocketCollision | StateTransitionEvent {
    for (;;) {
      const next = this.heap.pop()!

      if (!isEventValid(next)) continue

      if (next.type === 'CellTransition') {
        const event = next as CellTransitionEvent
        const circle = event.circles[0]

        // Advance circle and recompute full trajectory (including acceleration direction,
        // which depends on current velocity). Increment epoch to invalidate all stale events
        // (state transitions, collisions) that were scheduled from the old trajectory.
        // Then recompute() reschedules everything with the correct trajectory.
        circle.advanceTime(event.time)
        circle.clampToBounds(this.tableWidth, this.tableHeight)
        circle.rebaseTrajectory(this.profile, this.physicsConfig)

        this.grid.moveCircle(circle, event.toCell)
        circle.epoch++
        this.recompute(circle.id)
        continue
      }

      if (next.type === 'StateTransition') {
        for (const circle of next.circles) {
          circle.epoch++
        }
        return next as StateTransitionEvent
      }

      if (next.type === 'Pocket') {
        for (const circle of next.circles) {
          circle.epoch++
        }
        return next as PocketCollision
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
   * @param excludeIds - optional set of ball IDs to skip during ball-ball detection
   *   (used to suppress Zeno pairs that have exceeded their collision budget)
   */
  recompute(circleId: string, excludeIds?: Set<string>) {
    const referenceCircle = this.circlesById.get(circleId)!

    // Cushion collision (via detector from profile — may be segmented)
    // Airborne balls are above the table and don't interact with cushions
    if (referenceCircle.motionState !== MotionState.Airborne) {
      const cushionCollision = this.effectiveProfile.cushionDetector.detect(
        referenceCircle,
        this.tableWidth,
        this.tableHeight,
      )
      cushionCollision.seq = this.nextSeq++
      this.heap.push(cushionCollision)
    }

    // Pocket detection
    this.schedulePocketEvents(referenceCircle)

    // Ball-ball collisions with neighbors (via detector from profile)
    const neighbors = this.grid.getNearbyCircles(referenceCircle)
    for (const neighbor of neighbors) {
      if (excludeIds && excludeIds.has(neighbor.id)) continue
      const time = this.effectiveProfile.ballBallDetector.detect(referenceCircle, neighbor)
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

  /**
   * Remove a ball from the simulation (e.g. when pocketed).
   * Increments the ball's epoch to invalidate all pending events,
   * removes from spatial grid and tracking structures.
   */
  removeBall(ball: Ball) {
    ball.epoch++
    this.grid.removeCircle(ball)
    this.circlesById.delete(ball.id)
    const idx = this.circles.indexOf(ball)
    if (idx !== -1) this.circles.splice(idx, 1)
  }

}
