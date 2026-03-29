import { describe, it, expect } from 'vitest'
import { multiBallScenarios } from '../scenarios'
import type { TrajectoryCoeffs } from '../trajectory'
import type { CircleSnapshot } from '../simulation'
import { EventType } from '../simulation'
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

    // Striker should have stopped after hitting the chain
    const strikerHit = collisions.find((e) => getSnapshotById(e, 'striker'))
    const striker = getSnapshotById(strikerHit!, 'striker')!
    expect(computeSpeed(striker)).toBeLessThan(10)

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
  }, 15000)

  it('4 converging balls: all collisions resolved correctly', () => {
    const { replay } = runScenario(findScenario('converging-4-balls'))
    const collisions = getCollisionEvents(replay)
    // Cluster solver may resolve multiple contacts in a single event
    expect(collisions.length).toBeGreaterThanOrEqual(1)

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
    expect(replay.length).toBeLessThan(600000)
  }, 60000) // 60s timeout for large simulation
})

describe('overlap diagnosis: inter-event trajectory sampling', () => {
  /**
   * Track ball state from replay events and sample trajectory positions
   * between events to find where balls overlap.
   */
  it('break-22-with-spin: check all ball pairs between events', () => {
    const { replay } = runScenario(findScenario('break-22-with-spin'))

    // Track ball state: each ball has trajectory coefficients and reference time
    interface BallState {
      trajectory: TrajectoryCoeffs
      time: number
      radius: number
    }
    const balls = new Map<string, BallState>()

    function applySnapshot(snap: CircleSnapshot) {
      balls.set(snap.id, {
        trajectory: {
          a: [snap.trajectoryA[0], snap.trajectoryA[1], 0],
          b: [snap.velocity[0], snap.velocity[1], 0],
          c: [snap.position[0], snap.position[1], 0],
          maxDt: Infinity,
        },
        time: snap.time,
        radius: snap.radius,
      })
    }

    function posAt(ball: BallState, t: number): [number, number] {
      const dt = t - ball.time
      return [
        ball.trajectory.a[0] * dt * dt + ball.trajectory.b[0] * dt + ball.trajectory.c[0],
        ball.trajectory.a[1] * dt * dt + ball.trajectory.b[1] * dt + ball.trajectory.c[1],
      ]
    }

    function checkAllPairs(t: number, label: string): string[] {
      const violations: string[] = []
      const ids = [...balls.keys()]
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = balls.get(ids[i])!
          const b = balls.get(ids[j])!
          const pa = posAt(a, t)
          const pb = posAt(b, t)
          const dx = pa[0] - pb[0]
          const dy = pa[1] - pb[1]
          const dist = Math.sqrt(dx * dx + dy * dy)
          const rSum = a.radius + b.radius
          const overlap = rSum - dist
          if (overlap > 0.75) {
            violations.push(
              `${label} t=${t.toFixed(6)}: ${ids[i].slice(0, 8)} & ${ids[j].slice(0, 8)} ` +
                `overlap=${overlap.toFixed(3)}mm dist=${dist.toFixed(3)}mm`,
            )
          }
        }
      }
      return violations
    }

    const allViolations: string[] = []
    const SAMPLES = 3

    for (let ei = 0; ei < replay.length; ei++) {
      const event = replay[ei]

      // Apply event snapshots
      for (const snap of event.snapshots) {
        applySnapshot(snap)
      }

      // Check at event time
      allViolations.push(...checkAllPairs(event.time, `AT event[${ei}] type=${EventType[event.type]}`))

      // Sample between this event and the next
      if (ei + 1 < replay.length) {
        const t0 = event.time
        const t1 = replay[ei + 1].time
        if (t1 > t0 + 1e-9) {
          for (let s = 1; s <= SAMPLES; s++) {
            const t = t0 + ((t1 - t0) * s) / (SAMPLES + 1)
            allViolations.push(
              ...checkAllPairs(t, `BETWEEN event[${ei}]-[${ei + 1}]`),
            )
          }
        }
      }

      // Stop after first 5 violations to keep output manageable
      if (allViolations.length >= 5) break
    }

    if (allViolations.length > 0) {
      console.warn('OVERLAP VIOLATIONS FOUND:')
      for (const v of allViolations) console.warn('  ', v)

      // Log ALL events involving cue (regardless of index)
      console.warn('\n  ALL events involving cue:')
      for (let i = 0; i < replay.length; i++) {
        const e = replay[i]
        const hasCue = e.snapshots.some((s) => s.id === 'cue')
        if (hasCue) {
          const ballIds = e.snapshots.map((s) => s.id.slice(0, 8)).join(', ')
          console.warn(`  event[${i}] t=${e.time.toFixed(6)} type=${EventType[e.type]} balls=[${ballIds}]`)
          const cs = e.snapshots.find((s) => s.id === 'cue')!
          console.warn(`    cue: pos=(${cs.position[0].toFixed(2)}, ${cs.position[1].toFixed(2)}) vel=(${cs.velocity[0].toFixed(2)}, ${cs.velocity[1].toFixed(2)}) accel=(${cs.trajectoryA[0].toFixed(2)}, ${cs.trajectoryA[1].toFixed(2)}) state=${cs.motionState} time=${cs.time.toFixed(6)}`)
        }
      }

      // Show cue and rack-1 trajectories at overlap time
      const cueState = balls.get('cue')!
      const rack1State = balls.get('rack-1')!
      const overlapT = 0.686
      const cuePos = posAt(cueState, overlapT)
      const r1Pos = posAt(rack1State, overlapT)
      console.warn(`\n  At t=${overlapT}:`)
      console.warn(`    cue: pos=(${cuePos[0].toFixed(2)}, ${cuePos[1].toFixed(2)}) ref_time=${cueState.time.toFixed(6)}`)
      console.warn(`    rack-1: pos=(${r1Pos[0].toFixed(2)}, ${r1Pos[1].toFixed(2)}) ref_time=${rack1State.time.toFixed(6)}`)
    }
    expect(allViolations).toEqual([])
  })
})
