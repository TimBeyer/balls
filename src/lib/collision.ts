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

export function getCushionCollisionTime(tableWidth: number, tableHeight: number, circle: Circle): CushionCollision {
  const dx = circle.radius - circle.position[0]
  const dy = circle.radius - circle.position[1]

  const vx = circle.velocity[0]
  const vy = circle.velocity[1]

  const collisions: CushionCollision[] = [
    { type: 'Cushion', circles: [circle], cushion: Cushion.North, time: (tableHeight - circle.radius - circle.position[1]) / vy },
    { type: 'Cushion', circles: [circle], cushion: Cushion.East, time: (tableWidth - circle.radius - circle.position[0]) / vx },
    { type: 'Cushion', circles: [circle], cushion: Cushion.South, time: dy / vy },
    { type: 'Cushion', circles: [circle], cushion: Cushion.West, time: dx / vx }
  ]

  const sortedCollisions = collisions.sort((a, b) => a.time - b.time)
  const positiveCollisions = sortedCollisions.filter((collision) => collision.time > Number.EPSILON && collision.time !== Infinity)
  const collision = positiveCollisions[0]

  return Object.assign({}, collision, { time: collision.time + circle.time })
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
  const v = [v1[0] - v2[0], v1[1] - v2[1]]
  // then relative position
  const posX = posA[0] - posB[0]
  const posY = posA[1] - posB[1]

  // if the circles are already colliding, do not detect it
  const distance = Math.sqrt(Math.pow(posX, 2) + Math.pow(posY, 2))
  if (distance < (radiusA + radiusB)) {
    // console.log('Already colliding', (radiusA + radiusB) - distance)
    return undefined
  }

  // preparing for `ax^2 + bx + x = 0` solution

  // a = (vx^2 + vy^2)
  const a = Math.pow(v[0], 2) + Math.pow(v[1], 2)
  // b = 2 (a*vx + b*vy)
  const b = 2 * (posX * v[0] + posY * v[1])
  // c = a^2 + b^2 - (r1 + r2) ^ 2
  const c = Math.pow(posX, 2) + Math.pow(posY, 2) - Math.pow(radiusA + radiusB, 2)

  // the part +- sqrt(b^2 - 4ac)
  const sqrtPart = Math.sqrt(Math.pow(b, 2) - 4 * a * c)
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

export function getCollisions (tableWidth: number, tableHeight: number, _circles: Circle[]): Collision[] {
  // Make shallow copy
  const circles = _circles.slice()
  const collisions: Collision[] = []
  let referenceCircle

  while (circles.length > 0) {
    referenceCircle = circles.shift()
    collisions.push(getCushionCollisionTime(tableWidth, tableHeight, referenceCircle))

    for (const circle of circles) {
      const time = getCircleCollisionTime(referenceCircle, circle)

      if (time) {
        const circleCollision: CircleCollision = {
          type: 'Circle',
          time,
          circles: [referenceCircle, circle]
        }

        collisions.push(circleCollision)
      }
    }
  }

  return collisions.sort((a, b) => a.time - b.time)
}