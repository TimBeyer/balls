import Ball from './lib/ball'
import type Vector3D from './lib/vector3d'
import { MotionState } from './lib/motion-state'
import { ReplayData } from './lib/simulation'
import Renderer from './lib/renderers/renderer'
import CircleRenderer from './lib/renderers/circle-renderer'
import TailRenderer from './lib/renderers/tail-renderer'
import CollisionRenderer from './lib/renderers/collision-renderer'
import CollisionPreviewRenderer from './lib/renderers/collision-preview-renderer'
import FutureTrailRenderer from './lib/renderers/future-trail-renderer'
import * as THREE from 'three'
import SimulationScene from './lib/scene/simulation-scene'
import Stats from 'stats.js'
import { WorkerInitializationRequest, WorkerScenarioRequest, RequestMessageType } from './lib/worker-request'
import { WorkerResponse, isWorkerInitializationResponse, isWorkerSimulationResponse } from './lib/worker-response'
import { createConfig, SimulationConfig } from './lib/config'
import { createAdvancedUI } from './lib/ui'
import { defaultPhysicsConfig } from './lib/physics-config'
import { findScenario } from './lib/scenarios'
import { PlaybackController } from './lib/debug/playback-controller'
import { BallInspector } from './lib/debug/ball-inspector'
import { createSimulationBridge, computeBallData, type EventEntry, type BallEventSnapshot } from './lib/debug/simulation-bridge'
import { mountDebugOverlay } from './ui/index'

const config = createConfig()

// Support ?scenario=name URL parameter
const urlParams = new URLSearchParams(window.location.search)
const urlScenario = urlParams.get('scenario')
if (urlScenario) {
  config.scenarioName = urlScenario
}

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
const playbackController = new PlaybackController()
const ballInspector = new BallInspector()
let currentProgress = 0
let eventHistory: ReplayData[] = []

interface BallStateSnapshot {
  position: Vector3D
  velocity: Vector3D
  radius: number
  time: number
  angularVelocity: Vector3D
  motionState: MotionState
  trajectoryA: [number, number]
}
let initialBallStates: Map<string, BallStateSnapshot> | null = null
let lastConsumedEvent: EventEntry | null = null
let seekTarget: number | null = null

// --- Simulation Bridge (connects animation loop <-> React UI) ---
const bridge = createSimulationBridge(config, {
  onRestartRequired: () => startSimulation(),
  onPauseToggle: () => playbackController.togglePause(currentProgress),
  onStepForward: () => playbackController.requestStep(),
  onStepBack: () => playbackController.requestStepBack(),
  onStepToNextBallEvent: () => {
    const ballId = bridge.getSnapshot().selectedBallId
    if (ballId) playbackController.requestStepToBallEvent(ballId)
  },
  onSeek: (time: number) => {
    seekTarget = time
  },
  onLiveUpdate: () => {
    if (simulationScene) simulationScene.updateFromConfig(config)
    if (threeRenderer) threeRenderer.shadowMap.enabled = config.shadowsEnabled
  },
  clearBallSelection: () => ballInspector.clearSelection(),
})

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
  eventHistory = []
  initialBallStates = null
  currentProgress = 0
  lastConsumedEvent = null
  seekTarget = null
  playbackController.reset()
  // New canvas
  canvas2D = createCanvas(config)

  // Start new worker
  worker = new Worker(new URL('./lib/simulation.worker.ts', import.meta.url), { type: 'module' })

  // Send either a scenario load or random initialization
  const scenario = config.scenarioName ? findScenario(config.scenarioName) : undefined
  if (scenario) {
    // Override table dimensions from scenario
    config.tableWidth = scenario.table.width
    config.tableHeight = scenario.table.height
    canvas2D = createCanvas(config)

    const scenarioMessage: WorkerScenarioRequest = {
      type: RequestMessageType.LOAD_SCENARIO,
      payload: { scenario },
    }
    worker.postMessage(scenarioMessage)
  } else {
    const initMessage: WorkerInitializationRequest = {
      type: RequestMessageType.INITIALIZE_SIMULATION,
      payload: {
        numBalls: config.numBalls,
        tableHeight: config.tableHeight,
        tableWidth: config.tableWidth,
        physicsProfile: config.physicsProfile,
      },
    }
    worker.postMessage(initMessage)
  }
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

        // Capture initial ball states for step-back replay
        initialBallStates = new Map()
        for (const [id, ball] of Object.entries(state)) {
          initialBallStates.set(id, {
            position: [...ball.position],
            velocity: [...ball.velocity],
            radius: ball.radius,
            time: ball.time,
            angularVelocity: [...ball.angularVelocity],
            motionState: ball.motionState,
            trajectoryA: [ball.trajectory.a[0], ball.trajectory.a[1]],
          })
        }

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
  const futureTrailRenderer = new FutureTrailRenderer(
    canvas2D,
    config.futureTrailEventsPerBall,
    config.futureTrailInterpolationSteps,
    config.phantomBallOpacity,
    config.showPhantomBalls,
  )

  // Ball inspector click handling
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (config.showBallInspector) {
      ballInspector.handlePointerDown(e)
    }
  })
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (config.showBallInspector) {
      ballInspector.handlePointerUp(
        e,
        state,
        circleIds,
        currentProgress,
        scene.camera,
        renderer.domElement,
        config.tableWidth,
        config.tableHeight,
      )
    }
  })

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

  function snapshotBallState(ball: Ball, atTime: number): BallEventSnapshot {
    const dt = atTime - ball.time
    const vx = ball.trajectory.b[0] + 2 * ball.trajectory.a[0] * dt
    const vy = ball.trajectory.b[1] + 2 * ball.trajectory.a[1] * dt
    const pos = ball.positionAtTime(atTime)
    return {
      id: ball.id,
      position: [pos[0], pos[1]],
      velocity: [vx, vy],
      speed: Math.sqrt(vx * vx + vy * vy),
      angularVelocity: [ball.angularVelocity[0], ball.angularVelocity[1], ball.angularVelocity[2]],
      motionState: ball.motionState,
      acceleration: [ball.trajectory.a[0], ball.trajectory.a[1]],
    }
  }

  function applyEventSnapshots(event: ReplayData, skipHistory = false) {
    if (!skipHistory) {
      eventHistory.push(event)
    }

    // Capture pre-event state for all involved balls
    const deltas = event.snapshots.map((snapshot) => {
      const circle = state[snapshot.id]
      const before = snapshotBallState(circle, event.time)
      return { id: snapshot.id, before }
    })

    // Apply post-event state
    for (const snapshot of event.snapshots) {
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

    // Build deltas with after state
    const fullDeltas = deltas.map((d) => {
      const circle = state[d.id]
      return {
        ...d,
        after: snapshotBallState(circle, event.time),
      }
    })

    // Build event entry with deltas
    const entry: EventEntry = {
      time: event.time,
      type: event.type,
      involvedBalls: event.snapshots.map((s) => s.id),
      cushionType: event.cushionType,
      deltas: fullDeltas,
    }

    bridge.pushEvent(entry)
    lastConsumedEvent = entry
  }

  function step(timestamp: number) {
    stats!.begin()

    if (!start) start = timestamp

    // Convert ms timestamp to seconds to match physics time units
    const realProgress = ((timestamp - start) / 1000) * config.simulationSpeed

    // Playback controller determines effective progress
    const playback = playbackController.resolveProgress(realProgress, nextEvent)
    const progress = playback.progress
    currentProgress = progress

    // When unpausing, adjust start to prevent time jump
    if (!playbackController.paused && start !== undefined) {
      const expectedProgress = ((timestamp - start) / 1000) * config.simulationSpeed
      if (Math.abs(expectedProgress - progress) > 0.01) {
        start = timestamp - (progress / config.simulationSpeed) * 1000
      }
    }

    // Restore all balls to initial state (shared by step-back and seek)
    function restoreInitialState() {
      for (const [id, snap] of initialBallStates!) {
        const ball = state[id]
        ball.position[0] = snap.position[0]
        ball.position[1] = snap.position[1]
        ball.position[2] = 0
        ball.velocity[0] = snap.velocity[0]
        ball.velocity[1] = snap.velocity[1]
        ball.velocity[2] = 0
        ball.radius = snap.radius
        ball.time = snap.time
        ball.angularVelocity = [...snap.angularVelocity]
        ball.motionState = snap.motionState
        ball.trajectory.a[0] = snap.trajectoryA[0]
        ball.trajectory.a[1] = snap.trajectoryA[1]
        ball.trajectory.b[0] = snap.velocity[0]
        ball.trajectory.b[1] = snap.velocity[1]
        ball.trajectory.c[0] = snap.position[0]
        ball.trajectory.c[1] = snap.position[1]
      }
    }

    // Replay events from scratch and update frozen progress
    function replayAndFreeze(events: ReplayData[]) {
      eventHistory = []
      lastConsumedEvent = null
      for (const event of events) {
        applyEventSnapshots(event)
      }
      if (eventHistory.length > 0) {
        playbackController.frozenProgress = eventHistory[eventHistory.length - 1].time
      } else {
        playbackController.frozenProgress = 0
      }
      currentProgress = playbackController.frozenProgress
    }

    // Handle step-back: replay from initial state
    if (playback.stepBack && eventHistory.length > 0 && initialBallStates) {
      const poppedEvent = eventHistory.pop()!

      // Push current nextEvent back to front of queue
      if (nextEvent) {
        simulatedResults.unshift(nextEvent)
      }
      nextEvent = poppedEvent

      restoreInitialState()
      const eventsToReplay = [...eventHistory]
      replayAndFreeze(eventsToReplay)
    }

    // Handle seek: replay from initial state to target time
    if (seekTarget !== null && initialBallStates) {
      const target = seekTarget
      seekTarget = null

      // Collect all available events in order: history + nextEvent + simulatedResults
      const allEvents: ReplayData[] = [...eventHistory]
      if (nextEvent) allEvents.push(nextEvent)
      allEvents.push(...simulatedResults)

      // Split at target time
      const eventsToApply = allEvents.filter((e) => e.time <= target)
      const eventsRemaining = allEvents.filter((e) => e.time > target)

      // Restore and replay
      restoreInitialState()
      nextEvent = eventsRemaining.shift()
      simulatedResults = eventsRemaining
      replayAndFreeze(eventsToApply)

      // When seeking during playback, adjust start so realProgress matches target
      if (!playbackController.paused) {
        start = timestamp - (target / config.simulationSpeed) * 1000
        currentProgress = target
      }
    }

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

      if (playback.shouldProcessEvents) {
        if (playback.consumeUntilBallId) {
          // Step-to-ball-event mode: consume events until one involves the target ball
          const targetBallId = playback.consumeUntilBallId
          let found = false
          while (nextEvent && !found) {
            const involvesBall = nextEvent.snapshots.some((s) => s.id === targetBallId)
            applyEventSnapshots(nextEvent)
            if (involvesBall) {
              playbackController.frozenProgress = nextEvent.time
              currentProgress = nextEvent.time
              found = true
            }
            nextEvent = simulatedResults.shift()
          }
          if (!found) {
            // No more events for this ball — stay at last consumed event time
            if (eventHistory.length > 0) {
              playbackController.frozenProgress = eventHistory[eventHistory.length - 1].time
              currentProgress = playbackController.frozenProgress
            }
          }
        } else if (playback.consumeOneEvent) {
          // Step mode: process exactly one event
          if (nextEvent && progress >= nextEvent.time) {
            applyEventSnapshots(nextEvent)
            nextEvent = simulatedResults.shift()
          }
        } else {
          // Normal mode: process all due events
          while (nextEvent && progress >= nextEvent.time) {
            applyEventSnapshots(nextEvent)
            nextEvent = simulatedResults.shift()
          }
        }
      }
    }

    // 2D canvas rendering
    const ctx = canvas2D.getContext('2d')!
    ctx.fillStyle = config.tableColor
    ctx.fillRect(0, 0, canvas2D.width, canvas2D.height)

    // Update future trail renderer settings from config
    futureTrailRenderer.updateSettings(
      config.futureTrailEventsPerBall,
      config.futureTrailInterpolationSteps,
      config.phantomBallOpacity,
      config.showPhantomBalls,
    )

    // Build active renderers list based on config (reuse stateful renderers)
    const renderers: Renderer[] = []
    if (config.showCircles) renderers.push(circleRenderer)
    if (config.showTails) renderers.push(tailRenderer)
    if (config.showCollisions) renderers.push(collisionRenderer)
    if (config.showCollisionPreview) renderers.push(collisionPreviewRenderer)
    if (config.showFutureTrails) renderers.push(futureTrailRenderer)

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

    // Update bridge snapshot for React UI
    const selectedId = ballInspector.getSelectedBallId()
    const motionDist: Record<string, number> = {}
    for (const id of circleIds) {
      const ms = state[id].motionState
      motionDist[ms] = (motionDist[ms] || 0) + 1
    }
    bridge.update({
      currentProgress: progress,
      paused: playbackController.paused,
      simulationSpeed: config.simulationSpeed,
      selectedBallId: selectedId,
      selectedBallData: selectedId && state[selectedId] ? computeBallData(state[selectedId], progress) : null,
      ballCount: circleIds.length,
      bufferDepth: simulatedResults.length,
      simulationDone,
      motionDistribution: motionDist,
      canStepBack: eventHistory.length > 0,
      maxTime: simulatedResults.length > 0
        ? simulatedResults[simulatedResults.length - 1].time
        : nextEvent
          ? nextEvent.time
          : eventHistory.length > 0
            ? eventHistory[eventHistory.length - 1].time
            : progress,
      currentEvent: playbackController.paused ? lastConsumedEvent : null,
    })

    renderer.render(scene.scene, scene.camera)
    stats!.end()
    animationFrameId = window.requestAnimationFrame(step)
  }
  animationFrameId = window.requestAnimationFrame(step)
}

// --- UI Setup ---
// Advanced settings (Tweakpane, collapsed)
createAdvancedUI(config, {
  onRestartRequired: () => startSimulation(),
  onLiveUpdate: () => {
    if (simulationScene) simulationScene.updateFromConfig(config)
    if (threeRenderer) threeRenderer.shadowMap.enabled = config.shadowsEnabled
  },
})

// React debug overlay
mountDebugOverlay(bridge)

// Start initial simulation
startSimulation()
