/**
 * Fuzz testing — run many seeded random simulations and validate physics invariants.
 *
 * Three tiers:
 * 1. Quick (100 seeds × 5s) — fast iteration, catches obvious bugs
 * 2. Long (20 seeds × 30s) — exercises low-energy tail where balls cluster near walls
 * 3. Dense corners (20 seeds × 15s) — balls packed in a quarter-table, low velocity
 *
 * All tiers run with debug assertions enabled (assertBallInvariants after every event).
 */

import { describe, it, expect } from 'vitest'
import { simulate } from '../simulation'
import { validateSimulation } from './simulation-validator'
import { createPoolPhysicsProfile } from '../physics/physics-profile'
import { defaultPhysicsConfig, defaultBallParams } from '../physics-config'
import { generateCircles } from '../generate-circles'
import { seededRandom } from './test-helpers'
import Ball from '../ball'

const TABLE_W = 2540
const TABLE_H = 1270
const config = defaultPhysicsConfig
const profile = createPoolPhysicsProfile()
const mass = defaultBallParams.mass
const R = defaultBallParams.radius

function assertNoErrors(replay: ReturnType<typeof simulate>) {
  const result = validateSimulation(replay, TABLE_W, TABLE_H, mass)
  const errors = result.violations.filter((v) => v.severity === 'error')
  if (errors.length > 0) {
    const summary = errors.slice(0, 5).map((e) => `  [${e.type}] ${e.message}`)
    expect.fail(`${errors.length} violation(s):\n${summary.join('\n')}`)
  }
}

/**
 * Generate balls packed into a small area near a corner with low velocities.
 * Uses grid placement to avoid initial overlaps.
 */
function generateDenseCornerBalls(seed: number, count: number): Ball[] {
  const rng = seededRandom(seed + 5000)
  const gap = 10
  const cellSize = R * 2 + gap
  const maxJitter = gap / 2

  // Use bottom-left quarter of the table
  const quarterW = TABLE_W / 2
  const quarterH = TABLE_H / 2

  const cols = Math.floor((quarterW - 2 * R) / cellSize)
  const rows = Math.floor((quarterH - 2 * R) / cellSize)
  const totalCells = rows * cols
  const ballCount = Math.min(count, totalCells)

  // Fisher-Yates shuffle for random cell selection
  const cellIndices = Array.from({ length: totalCells }, (_, i) => i)
  for (let i = totalCells - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = cellIndices[i]
    cellIndices[i] = cellIndices[j]
    cellIndices[j] = tmp
  }

  const balls: Ball[] = []
  for (let i = 0; i < ballCount; i++) {
    const cellIndex = cellIndices[i]
    const row = Math.floor(cellIndex / cols)
    const col = cellIndex % cols

    const cx = R + col * cellSize + cellSize / 2
    const cy = R + row * cellSize + cellSize / 2

    const x = cx + (rng() * 2 - 1) * maxJitter
    const y = cy + (rng() * 2 - 1) * maxJitter

    // Low velocities: 50-200 mm/s
    const speed = 50 + rng() * 150
    const angle = rng() * Math.PI * 2
    const vx = speed * Math.cos(angle)
    const vy = speed * Math.sin(angle)

    const ballParams = { ...config.defaultBallParams, radius: R }
    const ball = new Ball([x, y, 0], [vx, vy, 0], R, 0, mass, undefined, [0, 0, 0], ballParams, config)
    ball.updateTrajectory(profile, config)
    balls.push(ball)
  }
  return balls
}

// ─── Tier 1: Quick fuzz (100 seeds × 5s) ─────────────────────────────────────

describe('fuzz: quick', { timeout: 60000 }, () => {
  for (let seed = 0; seed < 100; seed++) {
    const ballCount = 5 + (seed % 46)
    it(`seed ${seed}: ${ballCount} balls, 5s`, () => {
      const rng = seededRandom(seed)
      const balls = generateCircles(ballCount, TABLE_W, TABLE_H, rng, config, profile)
      const replay = simulate(TABLE_W, TABLE_H, 5, balls, config, profile, { debug: true })
      assertNoErrors(replay)
    })
  }
})

// ─── Tier 2: Long simulations (20 seeds × 30s) ───────────────────────────────

describe('fuzz: long simulations', { timeout: 120000 }, () => {
  for (let seed = 0; seed < 20; seed++) {
    it(`seed ${seed}: 30 balls, 30s`, () => {
      const rng = seededRandom(seed + 1000)
      const balls = generateCircles(30, TABLE_W, TABLE_H, rng, config, profile)
      const replay = simulate(TABLE_W, TABLE_H, 30, balls, config, profile, { debug: true })
      assertNoErrors(replay)
    })
  }
})

// ─── Tier 3: Dense corner clusters (20 seeds × 15s) ──────────────────────────

describe('fuzz: dense corners', { timeout: 60000 }, () => {
  for (let seed = 0; seed < 20; seed++) {
    it(`seed ${seed}: 15 balls in corner, low energy, 15s`, () => {
      const balls = generateDenseCornerBalls(seed, 15)
      const replay = simulate(TABLE_W, TABLE_H, 15, balls, config, profile, { debug: true })
      assertNoErrors(replay)
    })
  }
})
