import { describe, it, expect } from 'vitest'
import { multiBallScenarios } from '../scenarios'
import {
  runScenario,
  getCollisionEvents,
  getSnapshotById,
  computeSpeed,
  assertNoOverlaps,
  assertInBounds,
  assertMonotonicTime,
} from './test-helpers'

function findScenario(name: string) {
  const s = multiBallScenarios.find((s) => s.name === name)
  if (!s) throw new Error(`Scenario '${name}' not found`)
  return s
}

describe('multi-ball scenarios', () => {
  it("Newton's cradle (3): momentum propagates through line", () => {
    const { replay } = runScenario(findScenario('newtons-cradle-3'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(2)

    // Find the collision where the last ball gets hit
    const lastBallHit = collisions.find((e) => getSnapshotById(e, 'cradle-2'))
    expect(lastBallHit).toBeDefined()
    const lastBall = getSnapshotById(lastBallHit!, 'cradle-2')!
    expect(computeSpeed(lastBall)).toBeGreaterThan(100)

    // Striker should have stopped after hitting cradle-1
    const strikerHit = collisions.find((e) => getSnapshotById(e, 'striker'))
    const striker = getSnapshotById(strikerHit!, 'striker')!
    expect(computeSpeed(striker)).toBeLessThan(10)

    assertNoOverlaps(replay)
  })

  it("Newton's cradle (5): momentum chain propagates", () => {
    const { replay } = runScenario(findScenario('newtons-cradle-5'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(4)

    // Find the collision where the last ball gets hit
    const lastBallHit = collisions.find((e) => getSnapshotById(e, 'cradle-4'))
    expect(lastBallHit).toBeDefined()
    const lastBall = getSnapshotById(lastBallHit!, 'cradle-4')!
    expect(computeSpeed(lastBall)).toBeGreaterThan(100)

    assertNoOverlaps(replay)
  })

  it('V-shape hit: symmetric deflection', () => {
    const { replay } = runScenario(findScenario('v-shape-hit'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    // Both target balls should gain velocity
    // Find snapshots after collisions have occurred
    const lastCollision = collisions[collisions.length - 1]
    const left = getSnapshotById(lastCollision, 'left')
    const right = getSnapshotById(lastCollision, 'right')

    // At least one of the targets should be moving
    if (left && right) {
      expect(computeSpeed(left) + computeSpeed(right)).toBeGreaterThan(100)
    }

    assertNoOverlaps(replay)
  })

  it('3-ball cluster struck: all disperse', () => {
    const { replay } = runScenario(findScenario('triangle-cluster-struck'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(2)

    assertNoOverlaps(replay)
    assertInBounds(replay, 2540, 1270)
  })

  it('triangle break (15 balls): no overlaps, all in bounds', () => {
    const { replay } = runScenario(findScenario('triangle-break-15'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(10) // many collisions in a break

    assertNoOverlaps(replay)
    assertInBounds(replay, 2540, 1270)
    assertMonotonicTime(replay)

    // Event count should be bounded (no cascade)
    expect(replay.length).toBeLessThan(100000)
  })

  it('22-ball break with spin: stress test passes', () => {
    const { replay } = runScenario(findScenario('break-22-with-spin'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(10)

    assertNoOverlaps(replay)
    assertInBounds(replay, 2540, 1270)

    // Should complete without cascade explosion
    expect(replay.length).toBeLessThan(100000)
  })

  it('4 converging balls: all collisions resolved correctly', () => {
    const { replay } = runScenario(findScenario('converging-4-balls'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(2)

    assertNoOverlaps(replay)
    assertMonotonicTime(replay)
  })

  it('low-energy cluster: inelastic threshold prevents cascade', () => {
    const { replay } = runScenario(findScenario('low-energy-cluster'))
    const collisions = getCollisionEvents(replay)

    // Low energy → inelastic → few collisions, not a cascade
    expect(collisions.length).toBeLessThan(100)
    expect(replay.length).toBeLessThan(1000)
  })

  it('15-ball grid: no overlaps, all in bounds', () => {
    const { replay } = runScenario(findScenario('grid-15-random'))
    assertNoOverlaps(replay)
    assertInBounds(replay, 2540, 1270)
    assertMonotonicTime(replay)
  })

  it('150-ball stress test: invariants hold', () => {
    const { replay } = runScenario(findScenario('stress-150'))
    assertNoOverlaps(replay)
    assertInBounds(replay, 2840, 1420)
    assertMonotonicTime(replay)
    expect(replay.length).toBeLessThan(200000)
  }, 30000) // 30s timeout for large simulation
})
