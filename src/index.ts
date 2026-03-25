import Ball from './lib/ball'
import { ReplayData } from './lib/simulation'
import Renderer from './lib/renderers/renderer'
import CircleRenderer from './lib/renderers/circle-renderer'
import TailRenderer from './lib/renderers/tail-renderer'
import CollisionRenderer from './lib/renderers/collision-renderer'
import CollisionPreviewRenderer from './lib/renderers/collision-preview-renderer'
import * as THREE from 'three'
import SimulationScene from './lib/scene/simulation-scene'
import Stats from 'stats.js'
import { WorkerInitializationRequest, RequestMessageType } from './lib/worker-request'
import { WorkerResponse, isWorkerInitializationResponse, isWorkerSimulationResponse } from './lib/worker-response'
import { createConfig, SimulationConfig } from './lib/config'
import { createUI } from './lib/ui'
import { defaultPhysicsConfig } from './lib/physics-config'

const config = createConfig()

// Buffer ahead in seconds (physics uses seconds as time unit)
const PRECALC = 10

let worker: Worker | null = null
let state: { [key: string]: Ball } = {}
let circleIds: string[] = []
let replayCircles: Ball[] = []
let nextEvent: ReplayData | undefined
let simulatedResults: ReplayData[] = []
let fetchingMore = false
let simulationDone = false

let threeRenderer: THREE.WebGLRenderer | null = null
let simulationScene: SimulationScene | null = null
let stats: Stats | null = null
let animationFrameId: number | null = null
let start: number | undefined
let resizeHandler: (() => void) | null = null

function createCanvas(config: SimulationConfig) {
  const millimeterToPixel = 1 / 2
  const canvas = document.createElement('canvas')
  canvas.width = config.tableWidth * millimeterToPixel
  canvas.height = config.tableHeight * millimeterToPixel
  return canvas
}

let canvas2D = createCanvas(config)

function startSimulation() {
  // Clean up previous simulation
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  if (worker) {
    worker.terminate()
    worker = null
  }
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  if (threeRenderer) {
    document.body.removeChild(threeRenderer.domElement)
    threeRenderer.dispose()
    threeRenderer = null
  }

  // Reset state
  state = {}
  circleIds = []
  replayCircles = []
  nextEvent = undefined
  simulatedResults = []
  fetchingMore = false
  simulationDone = false
  start = undefined
  simulationScene = null

  // New canvas
  canvas2D = createCanvas(config)

  // Start new worker
  worker = new Worker(new URL('./lib/simulation.worker.ts', import.meta.url), { type: 'module' })

  const initMessage: WorkerInitializationRequest = {
    type: RequestMessageType.INITIALIZE_SIMULATION,
    payload: {
      numBalls: config.numBalls,
      tableHeight: config.tableHeight,
      tableWidth: config.tableWidth,
    },
  }

  worker.postMessage(initMessage)
  worker.addEventListener('message', (event: MessageEvent) => {
    const response: WorkerResponse = event.data

    if (isWorkerInitializationResponse(response)) {
      if (response.payload.status) {
        worker!.postMessage({
          type: RequestMessageType.REQUEST_SIMULATION_DATA,
          payload: {
            time: PRECALC * 2,
          },
        })
      }
    } else if (isWorkerSimulationResponse(response)) {
      const results = response.payload.data
      if (response.payload.initialValues) {
        state = response.payload.initialValues.snapshots.reduce(
          (circles: { [key: string]: Ball }, snapshot) => {
            const ball = new Ball(
              snapshot.position,
              snapshot.velocity,
              snapshot.radius,
              snapshot.time,
              defaultPhysicsConfig.defaultBallParams.mass,
              snapshot.id,
              snapshot.angularVelocity,
            )
            // Apply trajectory acceleration from snapshot for correct interpolation
            if (snapshot.trajectoryA) {
              ball.trajectory.a[0] = snapshot.trajectoryA[0]
              ball.trajectory.a[1] = snapshot.trajectoryA[1]
            }
            if (snapshot.motionState) {
              ball.motionState = snapshot.motionState
            }
            circles[snapshot.id] = ball
            return circles
          },
          {},
        )

        circleIds = Object.keys(state)
        replayCircles = Object.values(state)
        nextEvent = results.shift()
        queueMicrotask(initScene)
      }
      // If worker sends only the initial snapshot (time=0) or no real events,
      // all balls are stationary — stop requesting more data
      if (results.length === 0 || (results.length === 1 && results[0].time === 0)) {
        simulationDone = true
      }
      simulatedResults = simulatedResults.concat(results)
      fetchingMore = false
    }
  })
}

function initScene() {
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = config.shadowsEnabled
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  document.body.appendChild(renderer.domElement)
  threeRenderer = renderer

  const scene = new SimulationScene(canvas2D, replayCircles, config, renderer.domElement)
  simulationScene = scene
  renderer.render(scene.scene, scene.camera)

  const circleRenderer = new CircleRenderer(canvas2D)
  const tailRenderer = new TailRenderer(canvas2D, config.tailLength)
  const collisionRenderer = new CollisionRenderer(canvas2D)
  const collisionPreviewRenderer = new CollisionPreviewRenderer(canvas2D, config.collisionPreviewCount)

  if (!stats) {
    stats = new Stats()
    stats.showPanel(0)
    document.body.appendChild(stats.dom)
  }
  stats.dom.style.display = config.showStats ? 'block' : 'none'

  resizeHandler = () => {
    const width = window.innerWidth
    const height = window.innerHeight
    renderer.setSize(width, height)
    scene.camera.aspect = width / height
    scene.camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resizeHandler)

  function step(timestamp: number) {
    stats!.begin()

    if (!start) start = timestamp

    // Convert ms timestamp to seconds to match physics time units
    const progress = ((timestamp - start) / 1000) * config.simulationSpeed

    if (nextEvent) {
      const lastEvent = simulatedResults[simulatedResults.length - 1]
      if (!simulationDone && !fetchingMore && lastEvent && lastEvent.time - progress <= PRECALC) {
        fetchingMore = true
        worker!.postMessage({
          type: RequestMessageType.REQUEST_SIMULATION_DATA,
          payload: {
            time: PRECALC,
          },
        })
      }

      while (nextEvent && progress >= nextEvent.time) {
        // Only update balls involved in this event from their snapshots.
        // Non-involved balls keep their existing trajectory which remains valid
        // for positionAtTime() interpolation from their own reference time.
        for (const snapshot of nextEvent.snapshots) {
          const circle = state[snapshot.id]
          circle.position[0] = snapshot.position[0]
          circle.position[1] = snapshot.position[1]
          circle.velocity[0] = snapshot.velocity[0]
          circle.velocity[1] = snapshot.velocity[1]
          circle.radius = snapshot.radius
          circle.time = snapshot.time
          if (snapshot.angularVelocity) {
            circle.angularVelocity = [...snapshot.angularVelocity]
          }
          if (snapshot.motionState !== undefined) {
            circle.motionState = snapshot.motionState
          }
          // Rebase trajectory to new reference time (event time)
          circle.trajectory.a[0] = snapshot.trajectoryA[0]
          circle.trajectory.a[1] = snapshot.trajectoryA[1]
          circle.trajectory.b[0] = snapshot.velocity[0]
          circle.trajectory.b[1] = snapshot.velocity[1]
          circle.trajectory.c[0] = snapshot.position[0]
          circle.trajectory.c[1] = snapshot.position[1]
        }

        nextEvent = simulatedResults.shift()
      }
    }

    // 2D canvas rendering
    const ctx = canvas2D.getContext('2d')!
    ctx.fillStyle = config.tableColor
    ctx.fillRect(0, 0, canvas2D.width, canvas2D.height)

    // Build active renderers list based on config (reuse stateful renderers)
    const renderers: Renderer[] = []
    if (config.showCircles) renderers.push(circleRenderer)
    if (config.showTails) renderers.push(tailRenderer)
    if (config.showCollisions) renderers.push(collisionRenderer)
    if (config.showCollisionPreview) renderers.push(collisionPreviewRenderer)

    scene.renderAtTime(progress)
    if (nextEvent || simulatedResults.length > 0) {
      for (const r of renderers) {
        for (const circleId of circleIds) {
          const circle = state[circleId]
          if (nextEvent) {
            r.render(circle, progress, nextEvent, simulatedResults)
          }
        }
      }
    }

    // Update live parameters
    if (stats) {
      stats.dom.style.display = config.showStats ? 'block' : 'none'
    }
    renderer.shadowMap.enabled = config.shadowsEnabled

    renderer.render(scene.scene, scene.camera)
    stats!.end()
    animationFrameId = window.requestAnimationFrame(step)
  }
  animationFrameId = window.requestAnimationFrame(step)
}

// --- UI Setup ---
createUI(config, {
  onRestartRequired: () => startSimulation(),
  onLiveUpdate: () => {
    if (simulationScene) {
      simulationScene.updateFromConfig(config)
    }
    if (threeRenderer) {
      threeRenderer.shadowMap.enabled = config.shadowsEnabled
    }
  },
})

// Start initial simulation
startSimulation()
