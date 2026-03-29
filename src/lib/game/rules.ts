/**
 * GameRules interface — the contract that all game modes implement.
 *
 * Each game mode (8-ball, 9-ball, snooker) provides its own rules implementation
 * that handles ball setup, shot evaluation, scoring, and win conditions.
 */

import type { BallTextureSet } from '../scene/ball-textures'
import type { PhysicsConfig } from '../physics-config'
import type { BallSpec } from '../scenarios'
import type { ReplayData } from '../simulation'
import type { TableConfig } from '../table-config'
import type { GameState, ShotResult, ScoreDisplay } from './types'

export interface GameRules {
  readonly name: string
  readonly tableType: 'pool' | 'snooker'

  /** Get the table configuration (dimensions, pockets, cushion segments) */
  getTableConfig(): TableConfig

  /** Get the physics configuration for this game type */
  getPhysicsConfig(): PhysicsConfig

  /** Get the ball texture set to use */
  getBallTextureSet(): BallTextureSet

  /** Get the initial ball layout for a new game */
  setupBalls(): BallSpec[]

  /** Get the cue ball ID */
  getCueBallId(): string

  /**
   * Evaluate a completed shot. Called after all balls have come to rest.
   * Processes replay events to determine fouls, scoring, turn changes, and game over.
   */
  evaluateShot(events: ReplayData[], gameState: GameState): ShotResult

  /**
   * Get the IDs of balls that are valid first-contact targets for the current player.
   * Used for UI hints and foul detection.
   */
  getValidTargets(gameState: GameState): string[]

  /** Get score display data for the UI */
  getScoreDisplay(gameState: GameState): ScoreDisplay

  /** Get the maximum shot power in mm/s */
  getMaxShotSpeed(): number

  /** Get the ball radius for this game type in mm */
  getBallRadius(): number
}
