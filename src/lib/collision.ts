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
  const collisions: CushionCollision[] = [
    { type: 'Cushion', circles: [circle], cushion: Cushion.North, time: (tableHeight - circle.radius - circle.position[1]) / circle.velocity[1] },
    { type: 'Cushion', circles: [circle], cushion: Cushion.East, time: (tableWidth - circle.radius - circle.position[0]) / circle.velocity[0] },
    { type: 'Cushion', circles: [circle], cushion: Cushion.South, time: (circle.radius - circle.position[1]) / circle.velocity[1] },
    { type: 'Cushion', circles: [circle], cushion: Cushion.West, time: (circle.radius - circle.position[0]) / circle.velocity[0] }
  ]

  const positiveCollisions = collisions.filter((collision) => collision.time > Number.EPSILON && collision.time !== Infinity)
  const absoluteCollisions = positiveCollisions.map((collision) => Object.assign({}, collision, { time: collision.time + circle.time }))
  const sortedCollisions = absoluteCollisions.sort((a, b) => a.time - b.time)

  return sortedCollisions[0]
}


export function getCircleCollisionTime(circleA: Circle, circleB: Circle): number {
  const velocityA = circleA.velocity
  const velocityB = circleB.velocity

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
  const v = [velocityA[0] - velocityB[0], velocityA[1] - velocityB[1]]
  // then relative position
  const pos = [posA[0] - posB[0], posA[1] - posB[1]]

  // if the circles are already colliding, do not detect it
  const distance = Math.sqrt(Math.pow(pos[0], 2) + Math.pow(pos[1], 2))
  if (distance < (radiusA + radiusB)) {
    return undefined
  }

  // preparing for `ax^2 + bx + x = 0` solution

  // a = (vx^2 + vy^2)
  const a = Math.pow(v[0], 2) + Math.pow(v[1], 2)
  // b = 2 (a*vx + b*vy)
  const b = 2 * (pos[0] * v[0] + pos[1] * v[1])
  // c = a^2 + b^2 - (r1 + r2) ^ 2
  const c = Math.pow(pos[0], 2) + Math.pow(pos[1], 2) - Math.pow(radiusA + radiusB, 2)

  // the part +- sqrt(b^2 - 4ac)
  const sqrtPart = Math.sqrt(Math.pow(b, 2) - 4 * a * c)
  const divisor = 2 * a

  const results = [
    (-b + sqrtPart) / divisor,
    (-b - sqrtPart) / divisor
  ].filter((number) => {
    return !isNaN(number) && number > 0
  }).map((time) => {
    // Relative time back to absolute
    return time + circleB.time
  })

  return results.sort((a, b) => a - b)[0]
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