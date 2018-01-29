import Circle from "./circle";
import { RBTree } from 'bintrees'

export enum Cushion {
  North = "NORTH",
  East = "EAST",
  South = "SOUTH",
  West = "WEST",
}

export interface Collision {
  type: 'Circle' | 'Cushion'
  circles: Circle[],
  time: number
}

export interface CircleCollision extends Collision {
  type: 'Circle'
}

export interface CushionCollision extends Collision {
  type: 'Cushion'
  cushion: Cushion
}

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
  let earliestEvent = undefined

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
  
  return earliestEvent
}

export function getCircleCollisionTime(circleA: Circle, circleB: Circle): number {
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
  if (distance < (radiusA + radiusB)) {
    // console.log('Already colliding', (radiusA + radiusB) - distance)
    return undefined
  }

  // preparing for `ax^2 + bx + x = 0` solution

  // a = (vx^2 + vy^2)
  const a = (vx * vx) + (vy * vy)
  const r = radiusA + radiusB

  // b = 2 (a*vx + b*vy)
  const b = 2 * ((posX * vx) + (posY * vy))
  // c = a^2 + b^2 - (r1 + r2) ^ 2
  const c = distanceSquared - (r * r)

  // the part +- sqrt(b^2 - 4ac)
  const sqrtPart = Math.sqrt((b * b) - (4 * a * c))
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
}

class RelationStore<Entity> {
  private entityStores: Map<string, Set<Entity>> = new Map()

  add (keys: string[], entities: Entity[]) {
    for (const key of keys) {
      const entityStore = this.entityStores.get(key) || new Set()
      for (const entity of entities) {
        entityStore.add(entity)
      }
      this.entityStores.set(key, entityStore)
    }
  }

  get (keys: string[]): Entity[] {
    const allEntities = new Set()
    
    for (const key of keys) {
      const entityStore = this.entityStores.get(key)
      for (const entity of entityStore.values()) {
        allEntities.add(entity)
      }
    }

    return Array.from(allEntities)
  }

  delete (keys: string[]) {
    for (const key of keys) {
      this.entityStores.delete(key)
    }
  }
}

export class CollisionFinder {
  private uuidToCollision: RelationStore<Collision> = new RelationStore()
  private tree: RBTree<Collision>
  private tableWidth: number
  private tableHeight: number
  private circles: Circle[]
  private circlesById: Map<string, Circle> = new Map()

  constructor (tableWidth: number, tableHeight: number, circles: Circle[]) {
    const tree = new RBTree<Collision>(function (a, b) { return a.time - b.time; });

    this.tree = tree;
    this.tableWidth = tableWidth
    this.tableHeight = tableHeight
    this.circles = circles

    this.initialize()
  }

  initialize () {
    for (const circle of this.circles) {
      this.circlesById.set(circle.id, circle)
    }

    const circles = this.circles.slice()
    let referenceCircle

    while (circles.length > 0) {
      referenceCircle = circles.shift()
      const cushionCollision = getCushionCollision(this.tableWidth, this.tableHeight, referenceCircle)

      this.uuidToCollision.add([referenceCircle.id], [cushionCollision])

      this.tree.insert(cushionCollision)

      for (const circle of circles) {
        const time = getCircleCollisionTime(referenceCircle, circle)
        if (time) {
          const collision: Collision = {
            type: 'Circle',
            time,
            circles: [referenceCircle, circle]
          }
  
          this.tree.insert(collision)
          this.uuidToCollision.add([circle.id, referenceCircle.id], [collision])
        }
      }

    }
  }

  pop (): Collision {
    const next = this.tree.min()
    this.tree.remove(next)

    for (const circle of next.circles) {
      const collisions = this.uuidToCollision.get([circle.id])
      this.uuidToCollision.delete([circle.id])

      for (const collision of collisions) {
        this.tree.remove(collision)
      }
    }

    return next
  }

  recompute (circleId: string) {
    const referenceCircle = this.circlesById.get(circleId)
    
    const cushionCollision = getCushionCollision(this.tableWidth, this.tableHeight, referenceCircle)

    this.uuidToCollision.add([referenceCircle.id], [cushionCollision])

    this.tree.insert(cushionCollision)

    for (const circle of this.circles) {
      if (circle.id === circleId) {
        continue
      }

      const time = getCircleCollisionTime(referenceCircle, circle)
      if (time) {
        const collision: Collision = {
          type: 'Circle',
          time,
          circles: [referenceCircle, circle]
        }
  
        this.tree.insert(collision)
        this.uuidToCollision.add([circle.id, referenceCircle.id], [collision])
      }
    }
  }
}