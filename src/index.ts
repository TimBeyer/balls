import Circle from './lib/circle'
import { simulate } from './lib/simulation';
import Renderer from './lib/renderers/renderer';
import TailRenderer from './lib/renderers/tail-renderer';
// import stringToRGB from './lib/string-to-rgb';
import CircleRenderer from './lib/renderers/circle-renderer';
import CollisionRenderer from './lib/renderers/collision-renderer';
import CollisionPreviewRenderer from './lib/renderers/collision-preview-renderer';

// Measurements in millimeters
const TABLE_WIDTH = 2840
const TABLE_HEIGHT = 1420

const millimeterToPixel = 1/2
const CANVAS_WIDTH = TABLE_WIDTH * millimeterToPixel
const CANVAS_HEIGHT = TABLE_HEIGHT * millimeterToPixel

const randomCircle = function () {
  const radius = 37.5

  const x = (Math.random() * (TABLE_WIDTH - 2 * radius)) + radius;
  const y = (Math.random() * (TABLE_HEIGHT - 2 * radius)) + radius;

  const velocity: [number, number] = [Math.random() * 0.5, Math.random() * 0.5]

  return new Circle([x, y], velocity, radius, 0)

}

let circles = [];

const circlesCollide = function (c1: Circle, c2: Circle) : boolean {
  const distance = Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2))
  return distance <= (c1.radius + c2.radius)
}

// just brute force random generate a couple of non-overlapping circles instead of doing some fancy maths
while(circles.length <= 10) {
  let currentCircle = randomCircle()
  let circleCollides = circles.some((circle) => circlesCollide(circle, currentCircle))
  let attemptCount = 1
  while(circleCollides) {
    attemptCount += 1
    currentCircle = randomCircle()
    circleCollides = circles.some((circle) => circlesCollide(circle, currentCircle))

    if (attemptCount > 1000) {
      circles = []
      attemptCount = 0
    }
  }

  circles.push(currentCircle)
}

console.time('simulate')
const simulatedResults = simulate(TABLE_WIDTH, TABLE_HEIGHT, 120000, circles);
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

const renderers: Renderer[] = [
  new CircleRenderer(canvas),
  new TailRenderer(canvas, 500),
  new CollisionRenderer(canvas),
  new CollisionPreviewRenderer(canvas, 4)
]

let start
let nextEvent = simulatedResults.shift()

function step(timestamp) {

  if (!nextEvent) {
    console.log('Simulation ended')
    return
  }

  if (!start) start = timestamp;

  let progress = (timestamp - start) ;

  while (nextEvent && (progress >= nextEvent.absoluteTime)) {
    // console.log('Processing event at', nextEvent)
    // let timeToEvent = nextEvent.absoluteTime - previousProgress
    
    for (const snapshot of nextEvent.snapshots) {
      const circle = state[snapshot.id]
      Object.assign(circle, snapshot)
    }

    for (const circleId of circleIds) {
      const circle = state[circleId]
      circle.advanceTime(nextEvent.absoluteTime)
    }

    nextEvent = simulatedResults.shift()
    if (!nextEvent) {
      console.log('Simulation ended')
      return
    }
    // console.log('Next up', nextEvent)
  }

  ctx.fillStyle = "#888888";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  for (const circleId of circleIds) {
    const circle = state[circleId]
    for (const renderer of renderers) {
      renderer.render(circle, progress, nextEvent, simulatedResults)
    }
  }
  window.requestAnimationFrame(step);
  
}

window.requestAnimationFrame(step);