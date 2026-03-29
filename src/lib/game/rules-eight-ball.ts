/**
 * 8-Ball Pool rules implementation.
 *
 * Standard rules:
 * - 15 object balls (1-7 solids, 8-ball, 9-15 stripes) + cue ball
 * - After break, first legally potted ball assigns groups
 * - Must pot all balls in your group, then the 8-ball
 * - Fouls: wrong first contact, cue potted, no cushion after contact, potting 8-ball early
 */

import type { BallTextureSet } from '../scene/ball-textures'
import { defaultPhysicsConfig, type PhysicsConfig } from '../physics-config'
import type { BallSpec } from '../scenarios'
import { EventType, type ReplayData } from '../simulation'
import { createPoolTable, type TableConfig } from '../table-config'
import type { GameRules } from './rules'
import type { GameState, ShotResult, ScoreDisplay } from './types'

const CUE_BALL_ID = 'cue'
const EIGHT_BALL_ID = 'ball-8'

const SOLID_IDS = ['ball-1', 'ball-2', 'ball-3', 'ball-4', 'ball-5', 'ball-6', 'ball-7']
const STRIPE_IDS = ['ball-9', 'ball-10', 'ball-11', 'ball-12', 'ball-13', 'ball-14', 'ball-15']

const BALL_RADIUS = 28.575 // American pool ball: 2.25 inches = 57.15mm diameter

export class EightBallRules implements GameRules {
  readonly name = '8-Ball'
  readonly tableType = 'pool' as const

  private tableConfig = createPoolTable()

  getTableConfig(): TableConfig {
    return this.tableConfig
  }

  getPhysicsConfig(): PhysicsConfig {
    return {
      ...defaultPhysicsConfig,
      defaultBallParams: {
        ...defaultPhysicsConfig.defaultBallParams,
        radius: BALL_RADIUS,
      },
    }
  }

  getBallTextureSet(): BallTextureSet {
    return 'american'
  }

  getCueBallId(): string {
    return CUE_BALL_ID
  }

  getMaxShotSpeed(): number {
    return 5000 // mm/s
  }

  getBallRadius(): number {
    return BALL_RADIUS
  }

  setupBalls(): BallSpec[] {
    const tableConfig = this.tableConfig
    const cy = tableConfig.height / 2

    // Cue ball on the head string (1/4 from left)
    const cueBall: BallSpec = {
      id: CUE_BALL_ID,
      x: tableConfig.width * 0.25,
      y: cy,
    }

    // Rack: triangle at the foot spot (3/4 from left)
    const footX = tableConfig.width * 0.75
    const d = BALL_RADIUS * 2 + 0.01 // tiny gap
    const rowSpacing = d * Math.cos(Math.PI / 6)

    // Standard 8-ball rack layout:
    // Row 0: 1 ball
    // Row 1: 2 balls
    // Row 2: 3 balls (8-ball in center)
    // Row 3: 4 balls
    // Row 4: 5 balls
    // Rules: 8-ball in center, one solid and one stripe in back corners
    const rackOrder = [
      'ball-1', // row 0
      'ball-9', 'ball-2', // row 1
      'ball-10', 'ball-8', 'ball-3', // row 2 (8-ball center)
      'ball-11', 'ball-4', 'ball-12', 'ball-5', // row 3
      'ball-6', 'ball-13', 'ball-14', 'ball-7', 'ball-15', // row 4
    ]

    const rackBalls: BallSpec[] = []
    let idx = 0
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        rackBalls.push({
          id: rackOrder[idx],
          x: footX + row * rowSpacing,
          y: cy + (col - row / 2) * d,
        })
        idx++
      }
    }

    return [cueBall, ...rackBalls]
  }

  evaluateShot(events: ReplayData[], gameState: GameState): ShotResult {
    const result: ShotResult = {
      foul: false,
      foulReasons: [],
      switchTurn: true,
      respotBalls: [],
      scoreChange: 0,
      gameOver: false,
    }

    // Extract key information from replay events
    const pottedBalls: { ballId: string; pocketId: string }[] = []
    let firstContactBallId: string | undefined
    let cueBallPotted = false
    let eightBallPotted = false

    for (const event of events) {
      if (event.type === EventType.BallPocketed) {
        const ballId = event.snapshots[0].id
        const pocketId = event.pocketId!
        pottedBalls.push({ ballId, pocketId })

        if (ballId === CUE_BALL_ID) cueBallPotted = true
        if (ballId === EIGHT_BALL_ID) eightBallPotted = true
      }

      // First ball-ball collision involving the cue ball determines first contact
      if (event.type === EventType.CircleCollision && !firstContactBallId) {
        const involvedIds = event.snapshots.map((s) => s.id)
        if (involvedIds.includes(CUE_BALL_ID)) {
          firstContactBallId = involvedIds.find((id) => id !== CUE_BALL_ID)
        }
      }
    }

    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    const playerGroup = currentPlayer.group

    // Foul: cue ball potted (scratch)
    if (cueBallPotted) {
      result.foul = true
      result.foulReasons.push('Cue ball potted (scratch)')
    }

    // Foul: no ball contacted
    if (!firstContactBallId && !cueBallPotted) {
      result.foul = true
      result.foulReasons.push('Cue ball did not contact any object ball')
    }

    // Foul: wrong first contact (if groups are assigned)
    if (firstContactBallId && playerGroup) {
      const isValidTarget = this.isBallInGroup(firstContactBallId, playerGroup, gameState)
      if (!isValidTarget && firstContactBallId !== EIGHT_BALL_ID) {
        result.foul = true
        result.foulReasons.push(`Wrong ball contacted first (hit ${firstContactBallId})`)
      }
      // Can only hit 8-ball first if all group balls are potted
      if (firstContactBallId === EIGHT_BALL_ID) {
        const groupBallsRemaining = this.getGroupBallsOnTable(playerGroup, gameState)
        if (groupBallsRemaining.length > 0) {
          result.foul = true
          result.foulReasons.push('Hit 8-ball before clearing group')
        }
      }
    }

    // 8-ball potted — game over (win or loss)
    if (eightBallPotted) {
      result.gameOver = true
      if (result.foul) {
        // Potting 8-ball on a foul = loss
        result.winner = 1 - gameState.currentPlayerIndex
      } else if (playerGroup) {
        const groupBallsRemaining = this.getGroupBallsOnTable(playerGroup, gameState)
        if (groupBallsRemaining.length > 0) {
          // Potted 8-ball before clearing group = loss
          result.winner = 1 - gameState.currentPlayerIndex
        } else {
          // Legally potted 8-ball after clearing group = win!
          result.winner = gameState.currentPlayerIndex
        }
      } else {
        // 8-ball potted on break or before groups assigned — loss
        result.winner = 1 - gameState.currentPlayerIndex
      }
      return result
    }

    // Group assignment: if groups not yet assigned and a ball was legally potted
    if (!playerGroup && !result.foul) {
      const objectBallsPotted = pottedBalls.filter((p) => p.ballId !== CUE_BALL_ID)
      if (objectBallsPotted.length > 0) {
        const firstPotted = objectBallsPotted[0].ballId
        if (SOLID_IDS.includes(firstPotted)) {
          result.groupAssignment = { playerIndex: gameState.currentPlayerIndex, group: 'solids' }
        } else if (STRIPE_IDS.includes(firstPotted)) {
          result.groupAssignment = { playerIndex: gameState.currentPlayerIndex, group: 'stripes' }
        }
      }
    }

    // Determine if turn continues (potted a ball from own group legally)
    if (!result.foul && playerGroup) {
      const ownBallsPotted = pottedBalls.filter(
        (p) => p.ballId !== CUE_BALL_ID && this.isBallInGroup(p.ballId, playerGroup, gameState),
      )
      if (ownBallsPotted.length > 0) {
        result.switchTurn = false
      }
    }

    // After group assignment, if the shooter potted their own ball, continue
    if (!result.foul && result.groupAssignment && !playerGroup) {
      result.switchTurn = false
    }

    // Foul always means ball-in-hand for opponent
    if (result.foul) {
      result.switchTurn = true
    }

    return result
  }

  getValidTargets(gameState: GameState): string[] {
    const player = gameState.players[gameState.currentPlayerIndex]
    if (!player.group) {
      // Groups not assigned — any object ball is valid
      return [...gameState.ballsOnTable].filter((id) => id !== CUE_BALL_ID)
    }

    const groupBalls = this.getGroupBallsOnTable(player.group, gameState)
    if (groupBalls.length === 0) {
      // All group balls potted — 8-ball is the target
      return gameState.ballsOnTable.has(EIGHT_BALL_ID) ? [EIGHT_BALL_ID] : []
    }

    return groupBalls
  }

  getScoreDisplay(gameState: GameState): ScoreDisplay {
    return {
      players: gameState.players.map((p, i) => ({
        name: p.name,
        score: p.score,
        active: i === gameState.currentPlayerIndex,
        group: p.group ?? undefined,
      })),
    }
  }

  private isBallInGroup(ballId: string, group: 'solids' | 'stripes', _gameState: GameState): boolean {
    if (group === 'solids') return SOLID_IDS.includes(ballId)
    return STRIPE_IDS.includes(ballId)
  }

  private getGroupBallsOnTable(group: 'solids' | 'stripes', gameState: GameState): string[] {
    const groupIds = group === 'solids' ? SOLID_IDS : STRIPE_IDS
    return groupIds.filter((id) => gameState.ballsOnTable.has(id))
  }
}
