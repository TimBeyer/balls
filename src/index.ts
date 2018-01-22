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
  circles: Circle[],
  time: number
}

interface CircleCollision extends Collision {
  type: 'Circle'
}

interface CushionCollision extends Collision {
  type: 'Cushion'
  cushion: Cushion
}

const ballCollisionTime = function (circleA: Circle, circleB: Circle): number {
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
    return !isNaN(number) && number > Number.EPSILON
  }).map((time) => {
    // Relative time back to absolute
    return time + circleB.time
  })

  return results.sort()[0]
}

// Measurements in meters
const TABLE_WIDTH = 2.84
const TABLE_HEIGHT = 1.42

const cushionCollision = function (circle: Circle): CushionCollision {
  const collisions: CushionCollision[] = [
    { type: 'Cushion', circles: [circle], cushion: Cushion.North, time: (TABLE_HEIGHT - circle.radius - circle.position[1]) / circle.velocity[1] },
    { type: 'Cushion', circles: [circle], cushion: Cushion.East, time: (TABLE_WIDTH - circle.radius - circle.position[0]) / circle.velocity[0] },
    { type: 'Cushion', circles: [circle], cushion: Cushion.South, time: (circle.radius - circle.position[1]) / circle.velocity[1] },
    { type: 'Cushion', circles: [circle], cushion: Cushion.West, time: (circle.radius - circle.position[0]) / circle.velocity[0] }
  ]

  const positiveCollisions = collisions.filter((collision) => collision.time > Number.EPSILON && collision.time !== Infinity)
  const absoluteCollisions = positiveCollisions.map((collision) => Object.assign({}, collision, { time: collision.time + circle.time }))
  const sortedCollisions = absoluteCollisions.sort((a, b) => a.time - b.time)

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

  return collisions.sort((a, b) => a.time - b.time)
}

// 1 px = 2 mm
const meterToPixel = 100 * 5
const CANVAS_WIDTH = TABLE_WIDTH * meterToPixel
const CANVAS_HEIGHT = TABLE_HEIGHT * meterToPixel

interface CircleSnapshot {
  id: string
  position: Vector2D
  velocity: Vector2D
  radius: number
  time: number
}

interface ReplayData {

  // Absolute timestamp
  absoluteTime: number
  snapshots: CircleSnapshot[]
  type: EventType,
  cushionType?: Cushion
}

enum EventType {
  CircleCollision = 'CIRCLE_COLLISION',
  CushionCollision = 'CUSHION_COLLISION',
  StateUpdate = 'STATE_UPDATE'
}


/**
 * 
 * @param time the total timespan (in seconds) to simulate
 */
const simulate = function (time: number, circles: Circle[]) {
  let currentTime = 0
  const replay: ReplayData[] = []

  // initial snapshot
  replay.push({
    absoluteTime: 0,
    type: EventType.StateUpdate,
    snapshots: circles.map((circle) => {
      return {
        id: circle.id,
        position: [circle.position[0], circle.position[1]],
        velocity: [circle.velocity[0], circle.velocity[1]],
        radius: circle.radius,
        time: circle.time
      } as CircleSnapshot
    })
  })

  // for (let i = 0; i < 10; i++) {
// 
  while (currentTime < time) {
    const collisions = getCollisions(circles)

    const collision = collisions[0]

    for (const circle of collision.circles) {
      circle.advanceTime(collision.time)
    }

    if (collision.type === 'Cushion') {
      const cc = (collision as CushionCollision)
      const circle = cc.circles[0]
      if (cc.cushion === Cushion.North || cc.cushion === Cushion.South) {
        circle.velocity[1] = (-circle.velocity[1])
      } else if (cc.cushion === Cushion.East || cc.cushion === Cushion.West) {
        circle.velocity[0] = (-circle.velocity[0])
      }

      // To prevent floating point rounding errors from interfering
      // We force the position to be accurate instead of computing it
      switch (cc.cushion) {
        case Cushion.North:
          circle.position[1] = TABLE_HEIGHT - circle.radius
          break
        case Cushion.East: 
          circle.position[0] = TABLE_WIDTH - circle.radius
          break
        case Cushion.South:
          circle.position[1] = circle.radius
          break
        case Cushion.West:
          circle.position[0] = circle.radius 
          break

      }
    } else {
      const firstVel = collision.circles[0].velocity
      collision.circles[0].velocity = collision.circles[1].velocity
      collision.circles[1].velocity = firstVel
    }
    
    currentTime = collision.time

    const replayData: ReplayData = {
      absoluteTime: currentTime,
      type: collision.type === 'Cushion' ? EventType.CushionCollision : EventType.CircleCollision,
      cushionType: (collision as CushionCollision).cushion,
      snapshots: collision.circles.map((circle) => {
        return {
          id: circle.id,
          position: [circle.position[0], circle.position[1]],
          velocity: [circle.velocity[0], circle.velocity[1]],
          radius: circle.radius,
          time: circle.time
        } as CircleSnapshot
      })
    }

    replay.push(replayData)
  }
  return replay
}

const randomCircle = function () {
  const radius = 0.0375

  const x = (Math.random() * (TABLE_WIDTH - radius)) + radius;
  const y = (Math.random() * (TABLE_HEIGHT - radius)) + radius;

  const velocity: [number, number] = [Math.random() * 0.25, Math.random() * 0.25]

  return new Circle([x, y], velocity, radius, 0)

}

const circles = [];

for (let i = 0; i < 10; i++) {
  circles.push(randomCircle())
}
// const circles = [
//   randomCircle(),
//   randomCircle(),
//   randomCircle(),
//   randomCircle(),
//   randomCircle(),
//   randomCircle(),
//   randomCircle(),
//   randomCircle(),
//   randomCircle(),
//   randomCircle()
// ]
console.time('simulate')
const simulatedResults = simulate(120, circles);
console.timeEnd('simulate')
const initialValues = simulatedResults.shift()
// console.log(JSON.stringify(simulatedResults, null, 2))

const canvas = document.createElement('canvas')
canvas.width = CANVAS_WIDTH
canvas.height = CANVAS_HEIGHT

document.body.appendChild(canvas)

const ctx = canvas.getContext('2d')


let state: { [key: string]: Circle } = initialValues.snapshots.reduce((circles, snapshot) => {
  circles[snapshot.id] = new Circle(snapshot.position, snapshot.velocity, snapshot.radius, snapshot.time, snapshot.id)
  return circles
}, {})

const circleIds = Object.keys(state)

let start
let nextEvent = simulatedResults.shift()

function step(timestamp) {

  if (!nextEvent) {
    console.log('Simulation ended')
    return
  }

  if (!start) start = timestamp;
  let progress = (timestamp - start) / 1000;
  console.log(progress)
  
  while (nextEvent && (progress >= nextEvent.absoluteTime)) {
    console.log('Processing event at', nextEvent)
    // let timeToEvent = nextEvent.absoluteTime - previousProgress
    
    for (const snapshot of nextEvent.snapshots) {
      const circle = state[snapshot.id]
      if (Math.abs(circle.x - snapshot.position[0]) > 0.001) {
        console.log('Teleport')
        debugger;
      }
      Object.assign(circle, snapshot)
    }

    nextEvent = simulatedResults.shift()
    if (!nextEvent) {
      console.log('Simulation ended')
      return
    }
    console.log('Next up', nextEvent)
  }

  ctx.fillStyle = "#888888";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const nextCircleIds = nextEvent.snapshots.map((snapshot) => snapshot.id)

  for (const circleId of circleIds) {
    const circle = state[circleId]
    const position = circle.positionAtTime(progress)

    ctx.beginPath()
    if (nextCircleIds.includes(circleId)) {
      ctx.fillStyle = '#ff0000'
    } else {
      ctx.fillStyle = '#000000'
    }
    ctx.arc(position[0] * meterToPixel, CANVAS_HEIGHT - position[1] * meterToPixel, circle.radius * meterToPixel, 0, Math.PI * 2)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
    ctx.fillText(circle.id, position[0] * meterToPixel, CANVAS_HEIGHT - position[1] * meterToPixel)

    if (nextCircleIds.includes(circleId)) {
      ctx.beginPath()
      const collisionPosition = circle.positionAtTime(nextEvent.absoluteTime)
      ctx.arc(collisionPosition[0] * meterToPixel, CANVAS_HEIGHT - collisionPosition[1] * meterToPixel, circle.radius * meterToPixel, 0, Math.PI * 2)
      ctx.closePath()
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(position[0] * meterToPixel, CANVAS_HEIGHT - position[1] * meterToPixel)
      ctx.lineTo(collisionPosition[0] * meterToPixel, CANVAS_HEIGHT - collisionPosition[1] * meterToPixel)
      ctx.closePath()
      ctx.stroke()
    } 
  }
  
  window.requestAnimationFrame(step);
  
}

window.requestAnimationFrame(step);