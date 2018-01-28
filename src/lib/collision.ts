import Circle from "./circle";

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

export function getCollision (tableWidth: number, tableHeight: number, _circles: Circle[]): Collision {
  // Make shallow copy
  const circles = _circles.slice()
  const collisions: Collision[] = []
  let referenceCircle
  let earliestEventTime = Number.POSITIVE_INFINITY
  let earliestEvent: Collision = null

  while (circles.length > 0) {
    referenceCircle = circles.shift()

   const cushionCollision = getCushionCollision(tableWidth, tableHeight, referenceCircle)
   if (cushionCollision && cushionCollision.time < earliestEventTime) {
     earliestEventTime = cushionCollision.time
     earliestEvent = cushionCollision
   }

    for (const circle of circles) {
      const time = getCircleCollisionTime(referenceCircle, circle)
      if (time && time < earliestEventTime) {
        earliestEventTime = time
        earliestEvent = {
          type: 'Circle',
          time,
          circles: [referenceCircle, circle]
        }
      }
    }
  }

  return earliestEvent
}