import Circle from './lib/circle'
import Vector2D from './lib/vector2d'

enum Cushion {
  North = "NORTH",
  East = "EAST",
  South = "SOUTH",
  West = "WEST",
}

interface Collision {
  type: 'Circle' | 'Cushion'
  time: number
}

interface CircleCollision extends Collision {
  type: 'Circle'
  circles: Circle[]
}

interface CushionCollision extends Collision {
  type: 'Cushion'
  circle: Circle,
  cushion: Cushion
}

const ballCollisionTime = function (circleA: Circle, circleB: Circle): number {
  const velocityA = circleA.velocity
  const velocityB = circleB.velocity
  
  const posA = circleA.position
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
    return !isNaN(number) && number >= 0
  })

  return results.sort()[0]
}

// Measurements in meters
const TABLE_WIDTH = 2.84
const TABLE_HEIGHT = 1.42

const cushionCollision = function (circle: Circle): CushionCollision {
  const collisions: CushionCollision[] = [
    { type: 'Cushion', circle: circle, cushion: Cushion.North, time: (TABLE_HEIGHT - circle.radius - circle.position[1]) / circle.velocity[1] },
    { type: 'Cushion', circle: circle, cushion: Cushion.East, time: (TABLE_WIDTH - circle.radius - circle.position[0]) / circle.velocity[0] },
    { type: 'Cushion', circle: circle, cushion: Cushion.South, time: (circle.radius - circle.position[1]) / circle.velocity[1] },
    { type: 'Cushion', circle: circle, cushion: Cushion.West, time: (circle.radius - circle.position[0]) / circle.velocity[0] }
  ]

  console.log(collisions)
  const positiveCollisions = collisions.filter((collision) => collision.time > 0)
  const sortedCollisions = positiveCollisions.sort((a, b) => a.time - b.time)

  return sortedCollisions[0]
}

const getCollisions = function (_circles: Circle[]): Collision[] {
  // Make shallow copy
  const circles = _circles.slice()
  const collisions: Collision[] = []
  let referenceCircle


  while (circles.length > 0) {
    referenceCircle = circles.shift()
    collisions.push(cushionCollision(referenceCircle))

    for (const circle of circles) {
      const time = ballCollisionTime(referenceCircle, circle)
      
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

  return collisions
}

const circle1 = new Circle([0.5, 0.5], [0.1, 0], 0.0375)
const circle2 = new Circle([1.5, 0.5], [-0.1, 0], 0.0375)

console.log(circle1.toString())
console.log(circle2.toString())


console.log(JSON.stringify(getCollisions([circle1, circle2]), null, 2))
