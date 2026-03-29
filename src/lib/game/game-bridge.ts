/**
 * GameBridge — connects game state to React UI.
 * Analogous to SimulationBridge but for game-specific state.
 */

import type { GameState, ShotResult, ScoreDisplay } from './types'
import type { CueInputMode } from '../input/cue-input'
import type Vector2D from '../vector2d'

export interface GameSnapshot {
  gameState: GameState
  aimDirection: number
  aimPower: number
  strikeOffset: Vector2D
  elevation: number
  currentPlayerName: string
  scores: ScoreDisplay
  validTargets: string[]
  lastShotResult: ShotResult | null
  /** Whether the game is currently in simulation playback */
  isSimulating: boolean
  /** Current playback time during simulation */
  playbackTime: number
  /** Current input mode (aim vs camera) */
  inputMode: CueInputMode
}

export interface GameBridgeCallbacks {
  onShoot: () => void
  onPlaceCueBall: (position: Vector2D) => void
  onNewGame: () => void
  onBackToMenu: () => void
  onToggleMode: () => void
}

export interface GameBridge {
  subscribe(listener: () => void): () => void
  getSnapshot(): GameSnapshot
  update(data: Partial<GameSnapshot>): void
  callbacks: GameBridgeCallbacks
}

export function createGameBridge(callbacks: GameBridgeCallbacks): GameBridge {
  let snapshot: GameSnapshot = {
    gameState: {
      players: [],
      currentPlayerIndex: 0,
      ballsOnTable: new Set(),
      pottedBalls: [],
      currentBreak: [],
      fouls: [],
      turnNumber: 1,
      phase: 'aiming',
      ballInHand: false,
    },
    aimDirection: 0,
    aimPower: 0.5,
    strikeOffset: [0, 0],
    elevation: 0,
    currentPlayerName: '',
    scores: { players: [] },
    validTargets: [],
    lastShotResult: null,
    isSimulating: false,
    playbackTime: 0,
    inputMode: 'aim',
  }

  const listeners = new Set<() => void>()

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getSnapshot() {
      return snapshot
    },

    update(data: Partial<GameSnapshot>) {
      snapshot = { ...snapshot, ...data }
      for (const listener of listeners) {
        listener()
      }
    },

    callbacks,
  }
}
