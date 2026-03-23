import Circle from './circle'
import { RBTree } from 'bintrees'
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
  time: number
}

export interface CircleCollision extends Collision {
  type: 'Circle'
}

export interface CushionCollision extends Collision {
  type: 'Cushion'
  cushion: Cushion
}

export interface CellTransitionEvent {
  type: 'CellTransition'
  time: number
  circles: [Circle]
  toCell: number
}

export type TreeEvent = Collision | CellTransitionEvent

const isOkCollision = function (time: number) {
  return time > Number.EPSILON && time !== Infinity
}

export function getCushionCollision(tableWidth: number, tableHeight: number, circle: Circle): CushionCollision {
  const circleTime = circle.time
  const circles = [circle]

  const posX = circle.position[0]
  const posY = circle.position[1]

  const dx = circle.radius - posX
  const dy = circle.radius - posY

  const vx = circle.velocity[0]
  const vy = circle.velocity[1]

  const northCollision = (tableHeight - circle.radius - posY) / vy
  const eastCollision = (tableWidth - circle.radius - posX) / vx
  const southCollision = dy / vy
  const westCollision = dx / vx

  let earliestEventTime = Number.POSITIVE_INFINITY
  let earliestEvent: CushionCollision | undefined = undefined

  if (isOkCollision(northCollision)) {
    if (earliestEventTime > northCollision) {
      earliestEventTime = northCollision
      earliestEvent = { type: 'Cushion', circles, cushion: Cushion.North, time: northCollision + circleTime }
    }
  }

  if (isOkCollision(eastCollision)) {
    if (earliestEventTime > eastCollision) {
      earliestEventTime = eastCollision
      earliestEvent = { type: 'Cushion', circles, cushion: Cushion.East, time: eastCollision + circleTime }
    }
  }

  if (isOkCollision(southCollision)) {
    if (earliestEventTime > southCollision) {
      earliestEventTime = southCollision
      earliestEvent = { type: 'Cushion', circles, cushion: Cushion.South, time: southCollision + circleTime }
    }
  }

  if (isOkCollision(westCollision)) {
    if (earliestEventTime > westCollision) {
      earliestEventTime = westCollision
      earliestEvent = { type: 'Cushion', circles, cushion: Cushion.West, time: westCollision + circleTime }
    }
  }

  return earliestEvent!
}

export function getCircleCollisionTime(circleA: Circle, circleB: Circle): number | undefined {
  const v1 = circleA.velocity
  const v2 = circleB.velocity

  // since both circles could be in different relative times,
  // we need to move initial position into the same frame of reference

  const posA = circleA.positionAtTime(circleB.time)
  const posB = circleB.position

  const radiusA = circleA.radius
  const radiusB = circleB.radius

  /*
   * We pretend that one of the circles is static and use it as the frame of reference
   * We use the relative position and velocity
   * to calculate a collision with the static circle then
   */

  // first calculate relative velocity
  const vx = v1[0] - v2[0]
  const vy = v1[1] - v2[1]
  // then relative position
  const posX = posA[0] - posB[0]
  const posY = posA[1] - posB[1]

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
      return res1 + circleB.time
    }
  } else {
    if (!isNaN(res2) && res2 > 0) {
      return res2 + circleB.time
    }
  }

  return undefined
}

class RelationStore {
  private entityStores: Map<string, Set<TreeEvent>> = new Map()

  add(keys: string[], entities: TreeEvent[]) {
    for (const key of keys) {
      const entityStore = this.entityStores.get(key) || new Set()
      for (const entity of entities) {
        entityStore.add(entity)
      }
      this.entityStores.set(key, entityStore)
    }
  }

  get(keys: string[]): TreeEvent[] {
    const allEntities = new Set<TreeEvent>()

    for (const key of keys) {
      const entityStore = this.entityStores.get(key)
      if (entityStore) {
        for (const entity of entityStore.values()) {
          allEntities.add(entity)
        }
      }
    }

    return Array.from(allEntities)
  }

  delete(keys: string[]) {
    for (const key of keys) {
      this.entityStores.delete(key)
    }
  }
}

export class CollisionFinder {
  private uuidToCollision: RelationStore = new RelationStore()
  private tree: RBTree<TreeEvent>
  private tableWidth: number
  private tableHeight: number
  private circles: Circle[]
  private circlesById: Map<string, Circle> = new Map()
  private grid: SpatialGrid

  constructor(tableWidth: number, tableHeight: number, circles: Circle[]) {
    const tree = new RBTree<TreeEvent>(function (a, b) {
      return a.time - b.time
    })

    this.tree = tree
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
      this.uuidToCollision.add([circle.id], [cushionCollision])
      this.tree.insert(cushionCollision)

      const neighbors = this.grid.getNearbyCircles(circle)
      for (const neighbor of neighbors) {
        if (circle.id >= neighbor.id) continue
        const time = getCircleCollisionTime(circle, neighbor)
        if (time) {
          const collision: Collision = {
            type: 'Circle',
            time,
            circles: [circle, neighbor],
          }
          this.tree.insert(collision)
          this.uuidToCollision.add([circle.id, neighbor.id], [collision])
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
      }
      this.tree.insert(event)
      this.uuidToCollision.add([circle.id], [event])
    }
  }

  pop(): Collision {
    for (;;) {
      const next = this.tree.min()!
      this.tree.remove(next)

      if (next.type === 'CellTransition') {
        const event = next as CellTransitionEvent
        this.grid.moveCircle(event.circles[0], event.toCell)
        this.scheduleNextCellTransition(event.circles[0])
        continue
      }

      for (const circle of next.circles) {
        const events = this.uuidToCollision.get([circle.id])
        this.uuidToCollision.delete([circle.id])

        for (const event of events) {
          this.tree.remove(event)
        }
      }

      return next as Collision
    }
  }

  recompute(circleId: string) {
    const referenceCircle = this.circlesById.get(circleId)!

    const cushionCollision = getCushionCollision(this.tableWidth, this.tableHeight, referenceCircle)
    this.uuidToCollision.add([referenceCircle.id], [cushionCollision])
    this.tree.insert(cushionCollision)

    const neighbors = this.grid.getNearbyCircles(referenceCircle)
    for (const neighbor of neighbors) {
      const time = getCircleCollisionTime(referenceCircle, neighbor)
      if (time) {
        const collision: Collision = {
          type: 'Circle',
          time,
          circles: [referenceCircle, neighbor],
        }
        this.tree.insert(collision)
        this.uuidToCollision.add([neighbor.id, referenceCircle.id], [collision])
      }
    }

    this.scheduleNextCellTransition(referenceCircle)
  }
}
