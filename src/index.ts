import Circle from './lib/circle'
import { simulate } from './lib/simulation';
import Renderer from './lib/renderers/renderer';
import TailRenderer from './lib/renderers/tail-renderer';
// import stringToRGB from './lib/string-to-rgb';
import CircleRenderer from './lib/renderers/circle-renderer';
import CollisionRenderer from './lib/renderers/collision-renderer';
import CollisionPreviewRenderer from './lib/renderers/collision-preview-renderer';

import * as THREE from 'three';
import SimulationScene from './lib/scene/simulation-scene';
import * as Stats from 'stats.js'

// Measurements in millimeters
const TABLE_WIDTH = 2840
const TABLE_HEIGHT = 1420

const NUM_BALLS = 100
const SIM_TIME = 60000

const millimeterToPixel = 1/2
const CANVAS_WIDTH = TABLE_WIDTH * millimeterToPixel
const CANVAS_HEIGHT = TABLE_HEIGHT * millimeterToPixel

const randomCircle = function () {
  const radius = 37.5

  const x = (Math.random() * (TABLE_WIDTH - 2 * radius)) + radius;
  const y = (Math.random() * (TABLE_HEIGHT - 2 * radius)) + radius;

  const velocity: [number, number] = [Math.random() * 0.8, Math.random() * 0.8]
  return new Circle([x, y], velocity, radius, 0)

}

console.log(`Intializing ${NUM_BALLS} balls`)
console.time('initCircles')
let circles = [];

const circlesCollide = function (c1: Circle, c2: Circle) : boolean {
  const distance = Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2))
  return distance <= (c1.radius + c2.radius)
}

// just brute force random generate a couple of non-overlapping circles instead of doing some fancy maths
while(circles.length <= NUM_BALLS) {
  let currentCircle = randomCircle()
  let circleCollides = circles.some((circle) => circlesCollide(circle, currentCircle))
  let attemptCount = 1
  while(circleCollides) {
    attemptCount += 1
    currentCircle = randomCircle()
    circleCollides = circles.some((circle) => circlesCollide(circle, currentCircle))

    if (attemptCount > 5000) {
      circles = []
      attemptCount = 0
    }
  }

  circles.push(currentCircle)
}
console.timeEnd('initCircles')

console.log(`Simulating ${NUM_BALLS} balls for ${SIM_TIME / 1000} seconds`)
console.time('simulate')
const simulatedResults = simulate(TABLE_WIDTH, TABLE_HEIGHT, SIM_TIME, circles);
console.timeEnd('simulate')
console.log('Events:', simulatedResults.length)
const initialValues = simulatedResults.shift()
// console.log(JSON.stringify(simulatedResults, null, 2))

const canvas = document.createElement('canvas')
canvas.width = CANVAS_WIDTH
canvas.height = CANVAS_HEIGHT

// document.body.appendChild(canvas)

const ctx = canvas.getContext('2d')


let state: { [key: string]: Circle } = initialValues.snapshots.reduce((circles, snapshot) => {
  circles[snapshot.id] = new Circle(snapshot.position, snapshot.velocity, snapshot.radius, snapshot.time, 100, snapshot.id)
  return circles
}, {})

const circleIds = Object.keys(state)
const replayCircles = Object.values(state)

console.time('setupScene')
var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.gammaInput = true;
renderer.gammaOutput = true;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new SimulationScene(canvas, replayCircles);
// Initial render since it may take a while with loads of entities
renderer.render(scene.scene, scene.camera);

const renderers: Renderer[] = [
  new CircleRenderer(canvas),
  // new TailRenderer(canvas, 100),
  new CollisionRenderer(canvas),
  new CollisionPreviewRenderer(canvas, 10)
]
console.timeEnd('setupScene')

let start
let nextEvent = simulatedResults.shift()

var stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild(stats.dom);

function step(timestamp) {
  stats.begin();

  if (!nextEvent) {
    console.log('Simulation ended')
    return
  }

  if (!start) start = timestamp;

  let progress = (timestamp - start);

  while (nextEvent && (progress >= nextEvent.time)) {
    // console.log('Processing event at', nextEvent)
    // let timeToEvent = nextEvent.time - previousProgress
    
    for (const snapshot of nextEvent.snapshots) {
      const circle = state[snapshot.id]
      Object.assign(circle, snapshot)
    }

    for (const circleId of circleIds) {
      const circle = state[circleId]
      circle.advanceTime(nextEvent.time)
    }

    nextEvent = simulatedResults.shift()
    if (!nextEvent) {
      console.log('Simulation ended')
      return
    }
    // console.log('Next up', nextEvent)
  }

  // ctx.fillStyle = "#0a6c03";
  // ctx.fillStyle = "#0f0f0f";
  ctx.fillStyle = "#777777";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  scene.renderAtTime(progress)
  for (const renderer of renderers) {
    for (const circleId of circleIds) {
      const circle = state[circleId]
      renderer.render(circle, progress, nextEvent, simulatedResults)
    }
  }
  
  renderer.render(scene.scene, scene.camera);
  stats.end();
  window.requestAnimationFrame(step);

}

window.requestAnimationFrame(step);