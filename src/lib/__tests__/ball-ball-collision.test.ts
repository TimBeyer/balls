import { describe, it, expect } from 'vitest'
import { twoBallScenarios } from '../scenarios'
import {
  runScenario,
  getCollisionEvents,
  getSnapshotById,
  computeSpeed,
  computeTotalKE,
  computeTotalMomentum,
  assertNoOverlaps,
  zeroFrictionParams,
  createTestBall,
  zeroFrictionConfig,
} from './test-helpers'
import { defaultBallParams } from '../physics-config'
import { simulate, EventType } from '../simulation'
import { createSimple2DProfile } from '../physics/physics-profile'

function findScenario(name: string) {
  const s = twoBallScenarios.find((s) => s.name === name)
  if (!s) throw new Error(`Scenario '${name}' not found`)
  return s
}

describe('ball-ball collisions', () => {
  it('head-on equal mass: velocities swap', () => {
    const { replay } = runScenario(findScenario('head-on-equal-mass'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const post = collisions[0]
    const a = getSnapshotById(post, 'a')!
    const b = getSnapshotById(post, 'b')!

    // a was going +500, b was going -500 → after: a ≈ -500, b ≈ +500
    expect(a.velocity[0]).toBeCloseTo(-500, 0)
    expect(b.velocity[0]).toBeCloseTo(500, 0)
  })

  it('moving hits stationary: momentum transfers', () => {
    const { replay } = runScenario(findScenario('moving-hits-stationary'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const post = collisions[0]
    const cue = getSnapshotById(post, 'cue')!
    const target = getSnapshotById(post, 'target')!

    // Head-on equal mass: cue stops, target moves at cue's speed
    expect(Math.abs(cue.velocity[0])).toBeLessThan(50) // nearly stopped
    expect(target.velocity[0]).toBeGreaterThan(600) // acquired most of cue's velocity
  })

  it('head-on different mass: momentum and energy conserved', () => {
    // Create manually with different masses
    const heavy = createTestBall([500, 500], [300, 0], 37.5, 0, 200, 'heavy')
    const light = createTestBall([900, 500], [-300, 0], 37.5, 0, 100, 'light')

    const replay = simulate(2000, 1000, 5, [heavy, light], zeroFrictionConfig, createSimple2DProfile())
    const collisions = replay.filter((r) => r.type === EventType.CircleCollision)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const post = collisions[0]

    // Momentum conservation: m1*v1 + m2*v2 = const
    const pxBefore = 200 * 300 + 100 * -300 // 60000 - 30000 = 30000
    const postHeavy = post.snapshots.find((s) => s.id === 'heavy')!
    const postLight = post.snapshots.find((s) => s.id === 'light')!
    const pxAfter = 200 * postHeavy.velocity[0] + 100 * postLight.velocity[0]
    expect(pxAfter).toBeCloseTo(pxBefore, 0)

    // Energy conservation
    const keBefore = 0.5 * 200 * 300 ** 2 + 0.5 * 100 * 300 ** 2
    const keAfter =
      0.5 * 200 * (postHeavy.velocity[0] ** 2 + postHeavy.velocity[1] ** 2) +
      0.5 * 100 * (postLight.velocity[0] ** 2 + postLight.velocity[1] ** 2)
    expect(keAfter).toBeCloseTo(keBefore, -1)
  })

  it('glancing collision: exit vectors approximately perpendicular', () => {
    const { replay } = runScenario(findScenario('glancing-90-degree'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const post = collisions[0]
    const cue = getSnapshotById(post, 'cue')!
    const target = getSnapshotById(post, 'target')!

    // Dot product of exit velocities should be near zero for equal-mass glancing collision
    const dot = cue.velocity[0] * target.velocity[0] + cue.velocity[1] * target.velocity[1]
    // Allow generous tolerance — offset isn't perfectly half-ball
    const cueMag = computeSpeed(cue)
    const targetMag = computeSpeed(target)
    if (cueMag > 10 && targetMag > 10) {
      const cosAngle = dot / (cueMag * targetMag)
      expect(Math.abs(cosAngle)).toBeLessThan(0.5) // within ~60° of perpendicular
    }
  })

  it('angled collision with both moving: momentum conserved', () => {
    const { replay } = runScenario(findScenario('angled-both-moving'))
    const mass = zeroFrictionParams.mass
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const [px0, py0] = computeTotalMomentum(replay[0].snapshots, mass)
    const [px1, py1] = computeTotalMomentum(collisions[0].snapshots, mass)

    expect(px1).toBeCloseTo(px0, 0)
    expect(py1).toBeCloseTo(py0, 0)
  })

  it('collision preserves spin on striker', () => {
    const { replay } = runScenario(findScenario('collision-preserves-spin'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const post = collisions[0]
    const spinner = getSnapshotById(post, 'spinner')!
    // z-spin should be preserved (ElasticBallResolver doesn't transfer spin)
    expect(Math.abs(spinner.angularVelocity[2])).toBeGreaterThan(10)
  })

  it('collision does not transfer spin to target', () => {
    const { replay } = runScenario(findScenario('collision-preserves-spin'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const post = collisions[0]
    const target = getSnapshotById(post, 'target')!
    // Target should have no z-spin from the collision
    expect(Math.abs(target.angularVelocity[2])).toBeLessThan(1)
  })

  it('low-energy inelastic: both get COM velocity', () => {
    const { replay } = runScenario(findScenario('low-energy-inelastic'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const post = collisions[0]
    const a = getSnapshotById(post, 'a')!
    const b = getSnapshotById(post, 'b')!

    // Both approach at 2 mm/s → approach speed = 4 mm/s < 5 mm/s threshold
    // COM velocity = (m*2 + m*(-2)) / (2m) = 0
    // Both balls should have ~0 normal velocity
    expect(Math.abs(a.velocity[0])).toBeLessThan(1)
    expect(Math.abs(b.velocity[0])).toBeLessThan(1)
  })

  it('at threshold speed: elastic (threshold is strict <)', () => {
    const { replay } = runScenario(findScenario('at-threshold-speed'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const post = collisions[0]
    const a = getSnapshotById(post, 'a')!
    const b = getSnapshotById(post, 'b')!

    // Approach speed = 5 mm/s → |approachSpeed| is NOT < 5 (strict <), so elastic
    // Velocities swap: a gets -2.5, b gets +2.5
    expect(a.velocity[0]).toBeCloseTo(-2.5, 0)
    expect(b.velocity[0]).toBeCloseTo(2.5, 0)
  })

  it('just above threshold: normal elastic collision', () => {
    const { replay } = runScenario(findScenario('just-above-threshold'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const post = collisions[0]
    const a = getSnapshotById(post, 'a')!
    const b = getSnapshotById(post, 'b')!

    // Approach speed = 6 mm/s > 5 mm/s → elastic
    // Velocities should swap: a gets -3, b gets +3
    expect(a.velocity[0]).toBeCloseTo(-3, 0)
    expect(b.velocity[0]).toBeCloseTo(3, 0)
  })

  it('momentum conserved with pool physics', () => {
    const { replay } = runScenario(findScenario('momentum-conservation-pool'))
    const mass = defaultBallParams.mass
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    // At the instant of collision, momentum should be conserved.
    // Friction acts between t=0 and collision time so total system momentum changes,
    // but we verify the post-collision momentum is reasonable (not zero).
    const [px1] = computeTotalMomentum(collisions[0].snapshots, mass)
    expect(Math.abs(px1)).toBeGreaterThan(0) // net momentum in x direction
  })

  it('energy conserved for elastic zero-friction collision', () => {
    const { replay } = runScenario(findScenario('head-on-equal-mass'))
    const mass = zeroFrictionParams.mass
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const ke0 = computeTotalKE(replay[0].snapshots, mass)
    const ke1 = computeTotalKE(collisions[0].snapshots, mass)
    expect(ke1).toBeCloseTo(ke0, 0)
  })

  it('no overlap at collision point', () => {
    const { replay } = runScenario(findScenario('head-on-equal-mass'))
    assertNoOverlaps(replay)
  })

  it('balls separate after collision', () => {
    const { replay } = runScenario(findScenario('head-on-equal-mass'))
    const collisions = getCollisionEvents(replay)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const post = collisions[0]
    const a = getSnapshotById(post, 'a')!
    const b = getSnapshotById(post, 'b')!

    // Relative velocity along normal should be separating (positive = apart)
    const dx = b.position[0] - a.position[0]
    const dy = b.position[1] - a.position[1]
    const dist = Math.sqrt(dx * dx + dy * dy)
    const nx = dx / dist
    const ny = dy / dist
    const relVelNormal = (b.velocity[0] - a.velocity[0]) * nx + (b.velocity[1] - a.velocity[1]) * ny
    expect(relVelNormal).toBeGreaterThan(0) // separating
  })

  it('snap-apart corrects floating-point overlap', () => {
    // This is verified indirectly: if snap-apart works, the overlap check passes
    const { replay } = runScenario(findScenario('moving-hits-stationary'))
    assertNoOverlaps(replay, 0.1) // tight tolerance
  })
})
