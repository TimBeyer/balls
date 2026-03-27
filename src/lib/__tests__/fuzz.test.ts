/**
 * Fuzz testing — run many seeded random simulations and validate physics invariants.
 *
 * Each test generates random ball configurations and runs a 5-second simulation,
 * then checks for violations using the simulation validator.
 */

import { describe, it, expect } from 'vitest'
import { simulate } from '../simulation'
import { validateSimulation } from './simulation-validator'
import { createPoolPhysicsProfile } from '../physics/physics-profile'
import { defaultPhysicsConfig, defaultBallParams } from '../physics-config'
import { generateCircles } from '../generate-circles'
import { seededRandom } from './test-helpers'

const TABLE_W = 2540
const TABLE_H = 1270
const DURATION = 5
const config = defaultPhysicsConfig
const profile = createPoolPhysicsProfile()
const mass = defaultBallParams.mass

describe('fuzz testing', { timeout: 60000 }, () => {
  for (let seed = 0; seed < 100; seed++) {
    const ballCount = 5 + (seed % 46) // 5 to 50 balls
    it(`seed ${seed}: ${ballCount} balls, ${DURATION}s`, () => {
      const rng = seededRandom(seed)
      const balls = generateCircles(ballCount, TABLE_W, TABLE_H, rng, config, profile)
      const replay = simulate(TABLE_W, TABLE_H, DURATION, balls, config, profile)
      const result = validateSimulation(replay, TABLE_W, TABLE_H, mass)
      const errors = result.violations.filter((v) => v.severity === 'error')
      if (errors.length > 0) {
        const summary = errors.slice(0, 5).map((e) => `  [${e.type}] ${e.message}`)
        expect.fail(`${errors.length} violation(s):\n${summary.join('\n')}`)
      }
    })
  }
})
