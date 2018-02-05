import Circle from './lib/circle'
import { simulate, ReplayData } from './lib/simulation';
import Renderer from './lib/renderers/renderer';
import TailRenderer from './lib/renderers/tail-renderer';
// import stringToRGB from './lib/string-to-rgb';
import CircleRenderer from './lib/renderers/circle-renderer';
import CollisionRenderer from './lib/renderers/collision-renderer';
import CollisionPreviewRenderer from './lib/renderers/collision-preview-renderer';

import * as THREE from 'three';
import SimulationScene from './lib/scene/simulation-scene';
import * as Stats from 'stats.js'

import Worker from 'worker-loader!./lib/simulation.worker'
import { WorkerInitializationRequest, RequestMessageType } from './lib/worker-request';
import { WorkerSimulationResponse, isWorkerInitializationResponse, isWorkerSimulationResponse } from './lib/worker-response';

// Measurements in millimeters
const TABLE_WIDTH = 2840
const TABLE_HEIGHT = 1420

const NUM_BALLS = 150

const millimeterToPixel = 1/2
const CANVAS_WIDTH = TABLE_WIDTH * millimeterToPixel
const CANVAS_HEIGHT = TABLE_HEIGHT * millimeterToPixel

const canvas = document.createElement('canvas')
canvas.width = CANVAS_WIDTH
canvas.height = CANVAS_HEIGHT

// document.body.appendChild(canvas)

const ctx = canvas.getContext('2d')

const PRECALC = 10000
let fetchingMore = false

const worker = new Worker()

const initMessage: WorkerInitializationRequest = {
  type: RequestMessageType.INITIALIZE_SIMULATION,
  payload: {
    numBalls: NUM_BALLS,
    tableHeight: TABLE_HEIGHT,
    tableWidth: TABLE_WIDTH
  }
}
let state: { [key: string]: Circle }
let circleIds, replayCircles, nextEvent, simulatedResults: ReplayData[] = []

worker.postMessage(initMessage);
worker.addEventListener("message", (event) => {
  const response: WorkerSimulationResponse = event.data

  if (isWorkerInitializationResponse(response)) {
    if (response.payload.status) {
      worker.postMessage({
        type: RequestMessageType.REQUEST_SIMULATION_DATA,
        payload: {
          time: PRECALC * 2
        }
      })
    }
  } else if (isWorkerSimulationResponse(response)) {
    const results = response.payload.data
    if (response.payload.initialValues) {
      state = response.payload.initialValues.snapshots.reduce((circles, snapshot) => {
        circles[snapshot.id] = new Circle(snapshot.position, snapshot.velocity, snapshot.radius, snapshot.time, 100, snapshot.id)
        return circles
      }, {})
      
      circleIds = Object.keys(state)
      replayCircles = Object.values(state)
      nextEvent = results.shift()
      process.nextTick(initScene)
    }
    simulatedResults = simulatedResults.concat(results)
    fetchingMore = false
    
  }
});

function initScene () {
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
    // new CollisionRenderer(canvas),
    // new CollisionPreviewRenderer(canvas, 10)
  ]
  console.timeEnd('setupScene')
  
  let start
  var stats = new Stats()
  stats.showPanel(0) // 0: fps, 1: ms, 2: mb, 3+: custom
  document.body.appendChild(stats.dom)
  
  function step(timestamp) {
    
    stats.begin();
    
    if (!nextEvent) {
      console.log('Simulation ended')
      return
    }
    
    if (!start) start = timestamp;
    
    let progress = (timestamp - start);
   
    const lastEvent = simulatedResults[simulatedResults.length - 1]
    if (!fetchingMore && lastEvent.time - progress <= PRECALC) {
      console.log('Running out of data, requesting more')
      fetchingMore = true
      worker.postMessage({
        type: RequestMessageType.REQUEST_SIMULATION_DATA,
        payload: {
          time: PRECALC
        }
      })
    }
  
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

}
