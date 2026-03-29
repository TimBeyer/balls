/**
 * Snooker rules implementation.
 *
 * Standard rules:
 * - 15 reds (1 point each), 6 colors (yellow=2, green=3, brown=4, blue=5, pink=6, black=7)
 * - Cue ball (white)
 * - Alternating red/color sequence: pot a red, then nominate and pot a color
 * - Colors are re-spotted after being potted (until all reds are gone)
 * - After all reds are gone, colors must be potted in ascending value order
 * - Foul minimum 4 points to opponent
 */

import type { BallTextureSet } from '../scene/ball-textures'
import { defaultPhysicsConfig, type PhysicsConfig } from '../physics-config'
import type { BallSpec } from '../scenarios'
import { EventType, type ReplayData } from '../simulation'
import { createSnookerTable, type TableConfig } from '../table-config'
import type { GameRules } from './rules'
import type { GameState, ShotResult, ScoreDisplay } from './types'
import type Vector2D from '../vector2d'

const CUE_BALL_ID = 'cue'
const BALL_RADIUS = 26.25 // Snooker ball: 52.5mm diameter

// Color ball IDs and their point values
const COLOR_BALLS: { id: string; value: number; name: string }[] = [
  { id: 'yellow', value: 2, name: 'Yellow' },
  { id: 'green', value: 3, name: 'Green' },
  { id: 'brown', value: 4, name: 'Brown' },
  { id: 'blue', value: 5, name: 'Blue' },
  { id: 'pink', value: 6, name: 'Pink' },
  { id: 'black', value: 7, name: 'Black' },
]

const COLOR_IDS = COLOR_BALLS.map((c) => c.id)
const RED_PREFIX = 'red-'

function isRed(ballId: string): boolean {
  return ballId.startsWith(RED_PREFIX)
}

function isColor(ballId: string): boolean {
  return COLOR_IDS.includes(ballId)
}

function getColorValue(ballId: string): number {
  const color = COLOR_BALLS.find((c) => c.id === ballId)
  return color?.value ?? 0
}

export class SnookerRules implements GameRules {
  readonly name = 'Snooker'
  readonly tableType = 'snooker' as const

  private tableConfig = createSnookerTable()

  // Spot positions (standard snooker table layout)
  private colorSpots: Map<string, Vector2D>

  constructor() {
    const w = this.tableConfig.width
    const h = this.tableConfig.height
    const baulkLine = w * 0.2 // "D" line ~20% from bottom cushion

    this.colorSpots = new Map([
      ['yellow', [baulkLine, h / 2 + h * 0.1]],
      ['green', [baulkLine, h / 2 - h * 0.1]],
      ['brown', [baulkLine, h / 2]],
      ['blue', [w / 2, h / 2]],
      ['pink', [w * 0.75 - BALL_RADIUS * 2, h / 2]],
      ['black', [w * 0.9, h / 2]],
    ])
  }

  getTableConfig(): TableConfig {
    return this.tableConfig
  }

  getPhysicsConfig(): PhysicsConfig {
    return {
      ...defaultPhysicsConfig,
      defaultBallParams: {
        ...defaultPhysicsConfig.defaultBallParams,
        radius: BALL_RADIUS,
        mass: 0.142, // snooker balls are lighter (~142g)
      },
    }
  }

  getBallTextureSet(): BallTextureSet {
    return 'snooker'
  }

  getCueBallId(): string {
    return CUE_BALL_ID
  }

  getMaxShotSpeed(): number {
    return 5000
  }

  getBallRadius(): number {
    return BALL_RADIUS
  }

  setupBalls(): BallSpec[] {
    const w = this.tableConfig.width
    const h = this.tableConfig.height
    const baulkLine = w * 0.2

    const balls: BallSpec[] = []

    // Cue ball in the "D"
    balls.push({
      id: CUE_BALL_ID,
      x: baulkLine - 100,
      y: h / 2,
    })

    // Color balls on their spots
    for (const [id, pos] of this.colorSpots) {
      balls.push({ id, x: pos[0], y: pos[1] })
    }

    // 15 reds in a triangle behind the pink spot
    const pinkSpot = this.colorSpots.get('pink')!
    const rackX = pinkSpot[0] + BALL_RADIUS * 2 + 2 // just behind pink
    const d = BALL_RADIUS * 2 + 0.01
    const rowSpacing = d * Math.cos(Math.PI / 6)

    let redIdx = 0
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        redIdx++
        balls.push({
          id: `${RED_PREFIX}${redIdx}`,
          x: rackX + row * rowSpacing,
          y: h / 2 + (col - row / 2) * d,
        })
      }
    }

    return balls
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

    const pottedBalls: { ballId: string; pocketId: string }[] = []
    let firstContactBallId: string | undefined
    let cueBallPotted = false

    for (const event of events) {
      if (event.type === EventType.BallPocketed) {
        const ballId = event.snapshots[0].id
        const pocketId = event.pocketId!
        pottedBalls.push({ ballId, pocketId })
        if (ballId === CUE_BALL_ID) cueBallPotted = true
      }

      if (event.type === EventType.CircleCollision && !firstContactBallId) {
        const involvedIds = event.snapshots.map((s) => s.id)
        if (involvedIds.includes(CUE_BALL_ID)) {
          firstContactBallId = involvedIds.find((id) => id !== CUE_BALL_ID)
        }
      }
    }

    const target = gameState.snookerTarget ?? 'red'
    const redsOnTable = this.getRedsOnTable(gameState)
    const inColorSequence = redsOnTable.length === 0

    // Foul: cue ball potted
    if (cueBallPotted) {
      result.foul = true
      result.foulReasons.push('Cue ball potted')
    }

    // Foul: no contact
    if (!firstContactBallId && !cueBallPotted) {
      result.foul = true
      result.foulReasons.push('Cue ball did not contact any ball')
    }

    // Foul: wrong ball contacted first
    if (firstContactBallId) {
      if (inColorSequence) {
        // Must hit the lowest remaining color
        const lowestColor = this.getLowestRemainingColor(gameState)
        if (lowestColor && firstContactBallId !== lowestColor) {
          result.foul = true
          result.foulReasons.push(`Must hit ${lowestColor} first`)
        }
      } else if (target === 'red') {
        if (!isRed(firstContactBallId)) {
          result.foul = true
          result.foulReasons.push('Must hit a red ball first')
        }
      } else {
        // target === 'color' — any color is valid first contact
        if (isRed(firstContactBallId)) {
          result.foul = true
          result.foulReasons.push('Must hit a color ball first')
        }
      }
    }

    // Calculate foul points (minimum 4, or value of the ball involved)
    if (result.foul) {
      let foulValue = 4
      // Foul value is the highest of: ball on, ball hit, ball potted
      if (firstContactBallId && isColor(firstContactBallId)) {
        foulValue = Math.max(foulValue, getColorValue(firstContactBallId))
      }
      for (const potted of pottedBalls) {
        if (isColor(potted.ballId)) {
          foulValue = Math.max(foulValue, getColorValue(potted.ballId))
        }
      }

      // Award foul points to opponent
      const opponentIdx = 1 - gameState.currentPlayerIndex
      result.scoreChange = 0 // no points for the fouling player
      // We'll add foul points to opponent via a separate mechanism
      // For now, encode as negative scoreChange (opponent gets points)
      gameState.players[opponentIdx].score += foulValue
    }

    // Process potted balls
    if (!result.foul) {
      let validPots = 0
      for (const potted of pottedBalls) {
        if (potted.ballId === CUE_BALL_ID) continue

        if (inColorSequence) {
          const lowestColor = this.getLowestRemainingColor(gameState)
          if (potted.ballId === lowestColor) {
            result.scoreChange += getColorValue(potted.ballId)
            validPots++
            // Colors in final sequence stay down
          } else {
            // Wrong color potted in sequence — foul
            result.foul = true
            result.foulReasons.push(`Wrong color potted (${potted.ballId})`)
          }
        } else if (target === 'red' && isRed(potted.ballId)) {
          result.scoreChange += 1
          validPots++
        } else if (target === 'color' && isColor(potted.ballId)) {
          result.scoreChange += getColorValue(potted.ballId)
          validPots++
          // Re-spot the color (reds still on table)
          const spotPos = this.colorSpots.get(potted.ballId)
          if (spotPos) {
            result.respotBalls.push({ ballId: potted.ballId, position: [...spotPos] as Vector2D })
          }
        } else {
          // Wrong type of ball potted
          result.foul = true
          const expected = target === 'red' ? 'a red' : 'a color'
          result.foulReasons.push(`Potted ${potted.ballId} when ${expected} was required`)
        }
      }

      // Continue turn if valid pot
      if (validPots > 0 && !result.foul) {
        result.switchTurn = false
      }
    }

    // Re-spot any colors potted on a foul (unless in final color sequence)
    if (result.foul && !inColorSequence) {
      for (const potted of pottedBalls) {
        if (isColor(potted.ballId)) {
          const spotPos = this.colorSpots.get(potted.ballId)
          if (spotPos) {
            result.respotBalls.push({ ballId: potted.ballId, position: [...spotPos] as Vector2D })
          }
        }
      }
    }

    // Check game over: all balls potted
    const remainingObjectBalls = [...gameState.ballsOnTable].filter((id) => id !== CUE_BALL_ID)
    // Subtract balls just potted (not yet removed from gameState)
    const justPotted = new Set(pottedBalls.map((p) => p.ballId))
    const willRemain = remainingObjectBalls.filter((id) => !justPotted.has(id) || result.respotBalls.some((r) => r.ballId === id))
    if (willRemain.length === 0) {
      result.gameOver = true
      // Winner is the player with the higher score
      const p0Score = gameState.players[0].score + (gameState.currentPlayerIndex === 0 ? result.scoreChange : 0)
      const p1Score = gameState.players[1].score + (gameState.currentPlayerIndex === 1 ? result.scoreChange : 0)
      result.winner = p0Score >= p1Score ? 0 : 1
    }

    return result
  }

  getValidTargets(gameState: GameState): string[] {
    const redsOnTable = this.getRedsOnTable(gameState)

    if (redsOnTable.length === 0) {
      // Color sequence — must pot lowest remaining color
      const lowest = this.getLowestRemainingColor(gameState)
      return lowest ? [lowest] : []
    }

    const target = gameState.snookerTarget ?? 'red'
    if (target === 'red') {
      return redsOnTable
    }

    // Color target — any color on the table
    return COLOR_IDS.filter((id) => gameState.ballsOnTable.has(id))
  }

  getScoreDisplay(gameState: GameState): ScoreDisplay {
    return {
      players: gameState.players.map((p, i) => ({
        name: p.name,
        score: p.score,
        active: i === gameState.currentPlayerIndex,
      })),
    }
  }

  private getRedsOnTable(gameState: GameState): string[] {
    return [...gameState.ballsOnTable].filter((id) => isRed(id))
  }

  private getLowestRemainingColor(gameState: GameState): string | null {
    for (const color of COLOR_BALLS) {
      if (gameState.ballsOnTable.has(color.id)) return color.id
    }
    return null
  }
}
