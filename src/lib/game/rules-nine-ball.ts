/**
 * 9-Ball Pool rules implementation.
 *
 * Standard rules:
 * - 9 object balls (1-9) + cue ball
 * - Must hit the lowest numbered ball on the table first
 * - Balls potted legally stay down
 * - Win: pot the 9-ball on a legal shot (at any time, e.g. combo)
 * - Fouls: wrong first contact, cue potted, no cushion after contact
 */

import type { BallTextureSet } from '../scene/ball-textures'
import { defaultPhysicsConfig, type PhysicsConfig } from '../physics-config'
import type { BallSpec } from '../scenarios'
import { EventType, type ReplayData } from '../simulation'
import { createPoolTable, type TableConfig } from '../table-config'
import type { GameRules } from './rules'
import type { GameState, ShotResult, ScoreDisplay } from './types'

const CUE_BALL_ID = 'cue'
const BALL_RADIUS = 28.575 // American pool ball

export class NineBallRules implements GameRules {
  readonly name = '9-Ball'
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
    return 5000
  }

  getBallRadius(): number {
    return BALL_RADIUS
  }

  setupBalls(): BallSpec[] {
    const tableConfig = this.tableConfig
    const cy = tableConfig.height / 2

    // Cue ball on the head string
    const cueBall: BallSpec = {
      id: CUE_BALL_ID,
      x: tableConfig.width * 0.25,
      y: cy,
    }

    // Diamond rack at the foot spot (3/4 from left)
    // 9-ball rack: diamond shape, 1-ball at front, 9-ball in center
    const footX = tableConfig.width * 0.75
    const d = BALL_RADIUS * 2 + 0.01
    const rowSpacing = d * Math.cos(Math.PI / 6)

    // Diamond layout:
    // Row 0: 1 ball (the 1-ball, at the apex)
    // Row 1: 2 balls
    // Row 2: 3 balls (9-ball in center)
    // Row 3: 2 balls
    // Row 4: 1 ball
    const rackOrder = [
      'ball-1', // row 0
      'ball-2', 'ball-3', // row 1
      'ball-4', 'ball-9', 'ball-5', // row 2 (9-ball center)
      'ball-6', 'ball-7', // row 3
      'ball-8', // row 4
    ]

    const rackBalls: BallSpec[] = []
    const rows = [1, 2, 3, 2, 1]
    let idx = 0
    for (let row = 0; row < rows.length; row++) {
      const count = rows[row]
      for (let col = 0; col < count; col++) {
        rackBalls.push({
          id: rackOrder[idx],
          x: footX + row * rowSpacing,
          y: cy + (col - (count - 1) / 2) * d,
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

    const pottedBalls: { ballId: string; pocketId: string }[] = []
    let firstContactBallId: string | undefined
    let cueBallPotted = false
    let nineBallPotted = false

    for (const event of events) {
      if (event.type === EventType.BallPocketed) {
        const ballId = event.snapshots[0].id
        const pocketId = event.pocketId!
        pottedBalls.push({ ballId, pocketId })

        if (ballId === CUE_BALL_ID) cueBallPotted = true
        if (ballId === 'ball-9') nineBallPotted = true
      }

      if (event.type === EventType.CircleCollision && !firstContactBallId) {
        const involvedIds = event.snapshots.map((s) => s.id)
        if (involvedIds.includes(CUE_BALL_ID)) {
          firstContactBallId = involvedIds.find((id) => id !== CUE_BALL_ID)
        }
      }
    }

    // Determine the lowest numbered ball on the table
    const lowestBall = this.getLowestBallOnTable(gameState)

    // Foul: cue ball potted
    if (cueBallPotted) {
      result.foul = true
      result.foulReasons.push('Cue ball potted (scratch)')
    }

    // Foul: no contact
    if (!firstContactBallId && !cueBallPotted) {
      result.foul = true
      result.foulReasons.push('Cue ball did not contact any object ball')
    }

    // Foul: wrong ball contacted first (must hit lowest numbered ball)
    if (firstContactBallId && lowestBall && firstContactBallId !== lowestBall) {
      result.foul = true
      result.foulReasons.push(`Must hit ${lowestBall} first (hit ${firstContactBallId})`)
    }

    // 9-ball potted
    if (nineBallPotted) {
      if (result.foul) {
        // 9-ball potted on a foul — re-spot the 9-ball, don't end game
        const spotPos = this.getRespotPosition()
        result.respotBalls.push({ ballId: 'ball-9', position: spotPos })
      } else {
        // Legal 9-ball pot = win!
        result.gameOver = true
        result.winner = gameState.currentPlayerIndex
        return result
      }
    }

    // If any ball was legally potted, continue turn
    if (!result.foul) {
      const objectBallsPotted = pottedBalls.filter((p) => p.ballId !== CUE_BALL_ID)
      if (objectBallsPotted.length > 0) {
        result.switchTurn = false
      }
    }

    // Foul always means ball-in-hand
    if (result.foul) {
      result.switchTurn = true
    }

    return result
  }

  getValidTargets(gameState: GameState): string[] {
    const lowest = this.getLowestBallOnTable(gameState)
    return lowest ? [lowest] : []
  }

  getScoreDisplay(gameState: GameState): ScoreDisplay {
    // 9-ball doesn't have traditional scoring — show balls remaining
    const ballsRemaining = [...gameState.ballsOnTable].filter((id) => id !== CUE_BALL_ID).length
    return {
      players: gameState.players.map((p, i) => ({
        name: p.name,
        score: p.score,
        active: i === gameState.currentPlayerIndex,
        group: `${ballsRemaining} balls left`,
      })),
    }
  }

  private getLowestBallOnTable(gameState: GameState): string | null {
    for (let i = 1; i <= 9; i++) {
      const id = `ball-${i}`
      if (gameState.ballsOnTable.has(id)) return id
    }
    return null
  }

  private getRespotPosition(): [number, number] {
    // Re-spot on the foot spot
    return [this.tableConfig.width * 0.75, this.tableConfig.height / 2]
  }
}
