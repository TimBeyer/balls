import type { SimulationConfig } from '../config'
import type { MotionState } from '../motion-state'
import type { EventType } from '../simulation'
import type Ball from '../ball'

export interface BallData {
  id: string
  position: [number, number]
  velocity: [number, number]
  speed: number
  angularVelocity: [number, number, number]
  motionState: MotionState
  acceleration: [number, number]
  radius: number
  mass: number
  time: number
}

export interface EventEntry {
  time: number
  type: EventType
  involvedBalls: string[]
  cushionType?: string
}

export interface SimulationSnapshot {
  currentProgress: number
  paused: boolean
  simulationSpeed: number
  selectedBallId: string | null
  selectedBallData: BallData | null
  ballCount: number
  bufferDepth: number
  simulationDone: boolean
  recentEvents: EventEntry[]
  motionDistribution: Record<string, number>
  canStepBack: boolean
}

export interface SimulationCallbacks {
  onRestartRequired: () => void
  onPauseToggle: () => void
  onStepForward: () => void
  onStepBack: () => void
  onLiveUpdate: () => void
  clearBallSelection: () => void
}

export interface SimulationBridge {
  subscribe(listener: () => void): () => void
  getSnapshot(): SimulationSnapshot
  config: SimulationConfig
  callbacks: SimulationCallbacks
  update(data: Partial<SimulationSnapshot>): void
  pushEvent(entry: EventEntry): void
}

const MAX_EVENTS = 50

function createInitialSnapshot(): SimulationSnapshot {
  return {
    currentProgress: 0,
    paused: false,
    simulationSpeed: 1,
    selectedBallId: null,
    selectedBallData: null,
    ballCount: 0,
    bufferDepth: 0,
    simulationDone: false,
    recentEvents: [],
    motionDistribution: {},
    canStepBack: false,
  }
}

export function computeBallData(ball: Ball, progress: number): BallData {
  const pos = ball.positionAtTime(progress)
  const dt = progress - ball.time
  const vx = ball.trajectory.b[0] + 2 * ball.trajectory.a[0] * dt
  const vy = ball.trajectory.b[1] + 2 * ball.trajectory.a[1] * dt
  return {
    id: ball.id,
    position: [pos[0], pos[1]],
    velocity: [vx, vy],
    speed: Math.sqrt(vx * vx + vy * vy),
    angularVelocity: [ball.angularVelocity[0], ball.angularVelocity[1], ball.angularVelocity[2]],
    motionState: ball.motionState,
    acceleration: [ball.trajectory.a[0], ball.trajectory.a[1]],
    radius: ball.radius,
    mass: ball.mass,
    time: ball.time,
  }
}

export function createSimulationBridge(
  config: SimulationConfig,
  callbacks: SimulationCallbacks,
): SimulationBridge {
  let snapshot = createInitialSnapshot()
  const listeners = new Set<() => void>()
  const eventBuffer: EventEntry[] = []

  function notify() {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getSnapshot() {
      return snapshot
    },

    config,
    callbacks,

    update(data: Partial<SimulationSnapshot>) {
      snapshot = { ...snapshot, ...data, recentEvents: eventBuffer.slice().reverse() }
      notify()
    },

    pushEvent(entry: EventEntry) {
      eventBuffer.push(entry)
      if (eventBuffer.length > MAX_EVENTS) {
        eventBuffer.shift()
      }
    },
  }
}
