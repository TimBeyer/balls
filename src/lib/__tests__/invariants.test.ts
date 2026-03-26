import { describe, it, expect } from 'vitest'
import {
  runScenario,
  getCollisionEvents,
  assertNoOverlaps,
  assertInBounds,
  assertMonotonicTime,
  assertEnergyNonIncreasing,
  computeTotalMomentum,
  getLastEvent,
  zeroFrictionParams,
} from './test-helpers'
import { multiBallScenarios, twoBallScenarios, type Scenario } from '../scenarios'
import { MotionState } from '../motion-state'
import { defaultBallParams } from '../physics-config'

function findScenario(name: string, list: Scenario[]) {
  const s = list.find((s) => s.name === name)
  if (!s) throw new Error(`Scenario '${name}' not found`)
  return s
}

describe('cross-cutting invariants', () => {
  it('no overlaps at any collision (zero-friction, 15 balls)', () => {
    const { replay } = runScenario(findScenario('grid-15-random', multiBallScenarios))
    assertNoOverlaps(replay)
  })

  it('no overlaps at any collision (pool physics, triangle break)', () => {
    const { replay } = runScenario(findScenario('triangle-break-15', multiBallScenarios))
    assertNoOverlaps(replay)
  })

  it('all balls in bounds (pool physics, 150 balls)', () => {
    const { replay } = runScenario(findScenario('stress-150', multiBallScenarios))
    assertInBounds(replay, 2840, 1420)
  }, 30000)

  it('time always monotonic', () => {
    const { replay } = runScenario(findScenario('triangle-break-15', multiBallScenarios))
    assertMonotonicTime(replay)
  })

  it('energy never increases through collisions (pool physics)', () => {
    const { replay } = runScenario(findScenario('triangle-break-15', multiBallScenarios))
    assertEnergyNonIncreasing(replay, defaultBallParams.mass, 0.02)
  })

  it('momentum conserved at elastic ball-ball collisions (zero friction)', () => {
    const { replay } = runScenario(findScenario('head-on-equal-mass', twoBallScenarios))
    const mass = zeroFrictionParams.mass

    const [px0, py0] = computeTotalMomentum(replay[0].snapshots, mass)
    const collisions = getCollisionEvents(replay)
    for (const event of collisions) {
      const [px, py] = computeTotalMomentum(event.snapshots, mass)
      expect(px).toBeCloseTo(px0, 0)
      expect(py).toBeCloseTo(py0, 0)
    }
  })

  it('all balls reach stationary (pool physics, 30s)', () => {
    // Use the multiple-balls-to-rest scenario from singleBallScenarios
    const scenario: Scenario = {
      name: 'invariant-all-stop',
      description: 'Several balls come to rest',
      table: { width: 2540, height: 1270 },
      balls: [
        { id: 'a', x: 400, y: 400, vx: 800, vy: 200 },
        { id: 'b', x: 1200, y: 800, vx: -500, vy: 300 },
        { id: 'c', x: 2000, y: 600, vx: 100, vy: -700 },
        { id: 'd', x: 800, y: 300, vx: -200, vy: 400 },
        { id: 'e', x: 1600, y: 900, vx: 600, vy: -100 },
      ],
      physics: 'pool',
      duration: 60,
    }

    const { replay } = runScenario(scenario)
    const lastEvent = getLastEvent(replay)
    for (const snap of lastEvent.snapshots) {
      expect(snap.motionState).toBe(MotionState.Stationary)
    }
  })

  it('event count stays bounded (pool, 150 balls, 5s)', () => {
    const scenario: Scenario = {
      name: 'invariant-bounded-events',
      description: '150 balls for 5s — event count check',
      table: { width: 2840, height: 1420 },
      balls: [], // uses generateCircles
      physics: 'pool',
      duration: 5,
    }

    const { replay } = runScenario(scenario)
    const collisions = getCollisionEvents(replay)

    // No cascade: event count should be reasonable
    expect(replay.length).toBeLessThan(50000)
    expect(collisions.length).toBeLessThan(30000)
  }, 30000)
})
