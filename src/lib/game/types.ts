/**
 * Core game state types shared across all game modes (8-ball, 9-ball, snooker).
 */

import type Vector2D from '../vector2d'

export interface Player {
  name: string
  score: number
  /** For 8-ball: assigned group after first legal pot ('solids' | 'stripes' | null) */
  group?: 'solids' | 'stripes' | null
}

export interface PottedBall {
  ballId: string
  pocketId: string
  turnNumber: number
}

export interface Foul {
  reason: string
  turnNumber: number
  /** Points awarded to opponent (snooker) */
  points?: number
}

export type GamePhase = 'aiming' | 'placing-cue-ball' | 'simulating' | 'evaluating' | 'game-over'

export interface GameState {
  players: Player[]
  currentPlayerIndex: number
  ballsOnTable: Set<string>
  pottedBalls: PottedBall[]
  /** Balls potted during the current visit/turn */
  currentBreak: PottedBall[]
  fouls: Foul[]
  turnNumber: number
  phase: GamePhase
  /** Ball-in-hand: the incoming player must place the cue ball */
  ballInHand: boolean
  /** For snooker: whether the next ball to pot should be a red or a color */
  snookerTarget?: 'red' | 'color'
  /** Winner index (set when phase = 'game-over') */
  winner?: number
}

export interface ShotResult {
  foul: boolean
  foulReasons: string[]
  switchTurn: boolean
  /** Balls that must be re-spotted (e.g. snooker colors) */
  respotBalls: { ballId: string; position: Vector2D }[]
  scoreChange: number
  gameOver: boolean
  winner?: number
  /** For 8-ball: group assignment that happened this shot */
  groupAssignment?: { playerIndex: number; group: 'solids' | 'stripes' }
}

export interface ShotParams {
  /** Aim direction in radians (0 = +x, π/2 = +y) */
  direction: number
  /** Power from 0 to 1 */
  power: number
  /** Strike offset on cue ball face, normalized to [-1, 1]. dx = english, dy = top/backspin */
  strikeOffset: Vector2D
  /** Cue elevation angle in radians (0 = level, >0 = massé). Default 0. */
  elevation: number
}

export interface ScoreDisplay {
  players: { name: string; score: number; active: boolean; group?: string }[]
}

export function createInitialGameState(playerNames: string[]): GameState {
  return {
    players: playerNames.map((name) => ({ name, score: 0 })),
    currentPlayerIndex: 0,
    ballsOnTable: new Set(),
    pottedBalls: [],
    currentBreak: [],
    fouls: [],
    turnNumber: 1,
    phase: 'aiming',
    ballInHand: false,
  }
}
