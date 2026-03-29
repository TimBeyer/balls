/**
 * GameController — orchestrates the game loop on the main thread.
 *
 * Manages game state, builds scenarios from ball positions + shot params,
 * sends to the physics worker, collects replay events, evaluates shots
 * via the GameRules interface, and handles turn management.
 */

import Ball from '../ball'
import { defaultPhysicsConfig } from '../physics-config'
import type { ReplayData } from '../simulation'
import { EventType } from '../simulation'
import { RequestMessageType, type WorkerScenarioRequest } from '../worker-request'
import {
  type WorkerResponse,
  isWorkerInitializationResponse,
  isWorkerSimulationResponse,
} from '../worker-response'
import type { BallSpec, Scenario } from '../scenarios'
import type { GameRules } from './rules'
import { type GameState, type ShotParams, type ShotResult, createInitialGameState } from './types'
import type Vector2D from '../vector2d'

const MAX_SIMULATION_TIME = 60 // seconds — safety limit

export interface GameControllerCallbacks {
  /** Called when game state changes (for React UI updates) */
  onStateChange: (state: GameState) => void
  /** Called when simulation starts — provides initial ball states for rendering */
  onSimulationStart: (balls: Ball[], replayEvents: ReplayData[]) => void
  /** Called when new replay events arrive during simulation */
  onReplayData: (events: ReplayData[]) => void
  /** Called when simulation is complete and shot has been evaluated */
  onShotComplete: (result: ShotResult) => void
  /** Called when the simulation is done (all balls at rest) */
  onSimulationDone: () => void
}

export class GameController {
  private rules: GameRules
  private state: GameState
  private worker: Worker | null = null
  private callbacks: GameControllerCallbacks
  private ballPositions: Map<string, Vector2D> = new Map()
  private allReplayEvents: ReplayData[] = []
  private simulationDone = false

  constructor(rules: GameRules, playerNames: string[], callbacks: GameControllerCallbacks) {
    this.rules = rules
    this.callbacks = callbacks
    this.state = createInitialGameState(playerNames)
  }

  get gameState(): GameState {
    return this.state
  }

  get gameRules(): GameRules {
    return this.rules
  }

  /** Start a new game — sets up balls and initializes the table */
  startGame() {
    this.state = createInitialGameState(this.state.players.map((p) => p.name))

    const ballSpecs = this.rules.setupBalls()

    // Track which balls are on the table
    for (const spec of ballSpecs) {
      const id = spec.id ?? `ball-${this.state.ballsOnTable.size}`
      this.state.ballsOnTable.add(id)
      this.ballPositions.set(id, [spec.x, spec.y])
    }

    this.state.phase = 'aiming'

    // Initialize snooker target if playing snooker
    if (this.rules.tableType === 'snooker') {
      this.state.snookerTarget = 'red'
    }

    this.callbacks.onStateChange(this.state)

    // Build initial scenario (all balls stationary) to get the scene rendered
    this.runScenario(ballSpecs, true)
  }

  /** Take a shot with the given parameters */
  takeShot(params: ShotParams) {
    if (this.state.phase !== 'aiming') return

    this.state.phase = 'simulating'
    this.state.currentBreak = []
    this.allReplayEvents = []
    this.simulationDone = false
    this.callbacks.onStateChange(this.state)

    // Convert shot params to velocity and spin
    const speed = params.power * this.rules.getMaxShotSpeed()
    const vx = speed * Math.cos(params.direction)
    const vy = speed * Math.sin(params.direction)

    // Compute spin from strike offset
    const R = this.rules.getBallRadius()
    const mass = this.rules.getPhysicsConfig().defaultBallParams.mass
    const spinFactor = (2 * speed) / (mass * R)
    const wx = -(params.strikeOffset[1] * spinFactor) // top/backspin
    const wy = params.strikeOffset[0] * spinFactor // left/right english
    const wz = 0 // no z-spin from normal cue strike

    // Elevation: add vertical velocity component for massé
    const vz = params.elevation > 0 ? speed * Math.sin(params.elevation) * 0.3 : 0

    // Build scenario from current ball positions + shot velocity on cue ball
    const cueBallId = this.rules.getCueBallId()
    const ballSpecs: BallSpec[] = []

    for (const [id, pos] of this.ballPositions) {
      if (id === cueBallId) {
        ballSpecs.push({
          id,
          x: pos[0],
          y: pos[1],
          vx,
          vy,
          vz,
          spin: [wx, wy, wz],
        })
      } else {
        ballSpecs.push({ id, x: pos[0], y: pos[1] })
      }
    }

    this.runScenario(ballSpecs, false)
  }

  /** Place the cue ball at a specific position (ball-in-hand) */
  placeCueBall(position: Vector2D) {
    const cueBallId = this.rules.getCueBallId()
    this.ballPositions.set(cueBallId, [...position])
    if (!this.state.ballsOnTable.has(cueBallId)) {
      this.state.ballsOnTable.add(cueBallId)
    }
    this.state.phase = 'aiming'
    this.state.ballInHand = false
    this.callbacks.onStateChange(this.state)
  }

  /** Clean up worker */
  destroy() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }

  private runScenario(ballSpecs: BallSpec[], isInitialSetup: boolean) {
    // Terminate previous worker
    if (this.worker) {
      this.worker.terminate()
    }

    this.worker = new Worker(new URL('../simulation.worker.ts', import.meta.url), { type: 'module' })

    const tableConfig = this.rules.getTableConfig()
    const scenario: Scenario = {
      name: isInitialSetup ? 'game-setup' : 'game-shot',
      description: '',
      table: { width: tableConfig.width, height: tableConfig.height },
      balls: ballSpecs,
      physics: 'pool',
      tableType: this.rules.tableType,
      duration: MAX_SIMULATION_TIME,
    }

    const scenarioMessage: WorkerScenarioRequest = {
      type: RequestMessageType.LOAD_SCENARIO,
      payload: { scenario },
    }

    this.worker.postMessage(scenarioMessage)

    this.worker.addEventListener('message', (event: MessageEvent) => {
      const response: WorkerResponse = event.data

      if (isWorkerInitializationResponse(response)) {
        if (response.payload.status) {
          // Request simulation data
          this.worker!.postMessage({
            type: RequestMessageType.REQUEST_SIMULATION_DATA,
            payload: { time: MAX_SIMULATION_TIME },
          })
        }
      } else if (isWorkerSimulationResponse(response)) {
        const results = response.payload.data

        if (response.payload.initialValues) {
          // Build Ball objects for rendering
          const balls = response.payload.initialValues.snapshots.map((snapshot) => {
            const ball = new Ball(
              snapshot.position,
              snapshot.velocity,
              snapshot.radius,
              snapshot.time,
              defaultPhysicsConfig.defaultBallParams.mass,
              snapshot.id,
              snapshot.angularVelocity,
            )
            if (snapshot.trajectoryA) {
              ball.trajectory.a[0] = snapshot.trajectoryA[0]
              ball.trajectory.a[1] = snapshot.trajectoryA[1]
            }
            if (snapshot.angularAlpha) {
              ball.angularTrajectory.alpha = [...snapshot.angularAlpha]
              ball.angularTrajectory.omega0 = [...snapshot.angularOmega0]
            }
            if (snapshot.motionState) {
              ball.motionState = snapshot.motionState
            }
            return ball
          })

          this.callbacks.onSimulationStart(balls, [response.payload.initialValues])
        }

        this.allReplayEvents.push(...results)
        this.callbacks.onReplayData(results)

        // Check if simulation is done (no more events or all stationary)
        if (results.length === 0 || (results.length === 1 && results[0].time === 0)) {
          this.simulationDone = true
        }

        if (this.simulationDone) {
          this.callbacks.onSimulationDone()

          if (!isInitialSetup) {
            this.onSimulationComplete()
          } else {
            // Initial setup: just record ball positions
            this.updateBallPositionsFromEvents(this.allReplayEvents)
          }
        } else {
          // Request more simulation data
          this.worker!.postMessage({
            type: RequestMessageType.REQUEST_SIMULATION_DATA,
            payload: { time: MAX_SIMULATION_TIME },
          })
        }
      }
    })
  }

  private onSimulationComplete() {
    // Update ball positions from final state
    this.updateBallPositionsFromEvents(this.allReplayEvents)

    // Evaluate the shot
    this.state.phase = 'evaluating'
    const shotResult = this.rules.evaluateShot(this.allReplayEvents, this.state)

    // Process pocketed balls
    for (const event of this.allReplayEvents) {
      if (event.type === EventType.BallPocketed) {
        const ballId = event.snapshots[0].id
        this.state.ballsOnTable.delete(ballId)
        this.ballPositions.delete(ballId)
        this.state.pottedBalls.push({
          ballId,
          pocketId: event.pocketId!,
          turnNumber: this.state.turnNumber,
        })
        this.state.currentBreak.push({
          ballId,
          pocketId: event.pocketId!,
          turnNumber: this.state.turnNumber,
        })
      }
    }

    // Apply group assignment
    if (shotResult.groupAssignment) {
      const { playerIndex, group } = shotResult.groupAssignment
      this.state.players[playerIndex].group = group
      this.state.players[1 - playerIndex].group = group === 'solids' ? 'stripes' : 'solids'
    }

    // Apply score
    this.state.players[this.state.currentPlayerIndex].score += shotResult.scoreChange

    // Handle fouls
    if (shotResult.foul) {
      for (const reason of shotResult.foulReasons) {
        this.state.fouls.push({ reason, turnNumber: this.state.turnNumber })
      }
    }

    // Re-spot balls (snooker colors)
    for (const respot of shotResult.respotBalls) {
      this.state.ballsOnTable.add(respot.ballId)
      this.ballPositions.set(respot.ballId, [...respot.position])
    }

    // Handle cue ball potted (ball-in-hand)
    const cueBallId = this.rules.getCueBallId()
    if (!this.state.ballsOnTable.has(cueBallId)) {
      // Cue ball was potted — re-add it for ball-in-hand placement
      this.state.ballInHand = true
    }

    // Game over
    if (shotResult.gameOver) {
      this.state.phase = 'game-over'
      this.state.winner = shotResult.winner
      this.callbacks.onShotComplete(shotResult)
      this.callbacks.onStateChange(this.state)
      return
    }

    // Update snooker target (red/color alternation)
    if (this.state.snookerTarget !== undefined) {
      if (shotResult.foul || shotResult.switchTurn) {
        // After a foul or turn switch, next player targets reds (unless no reds left)
        const redsLeft = [...this.state.ballsOnTable].some((id) => id.startsWith('red-'))
        this.state.snookerTarget = redsLeft ? 'red' : 'color'
      } else if (!shotResult.foul && shotResult.scoreChange > 0) {
        // Valid pot — toggle target
        const redsLeft = [...this.state.ballsOnTable].some((id) => id.startsWith('red-'))
        if (redsLeft) {
          this.state.snookerTarget = this.state.snookerTarget === 'red' ? 'color' : 'red'
        } else {
          this.state.snookerTarget = 'color'
        }
      }
    }

    // Switch turn or continue
    if (shotResult.switchTurn) {
      this.state.currentPlayerIndex = 1 - this.state.currentPlayerIndex
      this.state.turnNumber++
    }

    // Next phase
    if (this.state.ballInHand) {
      this.state.phase = 'placing-cue-ball'
    } else {
      this.state.phase = 'aiming'
    }

    this.callbacks.onShotComplete(shotResult)
    this.callbacks.onStateChange(this.state)
  }

  /**
   * Update stored ball positions from the last replay events.
   * Uses the last snapshot of each ball to determine final positions.
   */
  private updateBallPositionsFromEvents(events: ReplayData[]) {
    // Process events in chronological order — last snapshot wins
    for (const event of events) {
      for (const snapshot of event.snapshots) {
        if (event.type === EventType.BallPocketed) {
          // Don't update position for pocketed balls
          continue
        }
        this.ballPositions.set(snapshot.id, [snapshot.position[0], snapshot.position[1]])
      }
    }
  }
}
