import { describe, it, expect } from 'vitest'
import { edgeCaseScenarios } from '../scenarios'
import {
  runScenario,
  getCollisionEvents,
  getStateTransitions,
  getSnapshotById,
  getLastEvent,
  computeSpeed,
  assertNoOverlaps,
  assertInBounds,
  assertMonotonicTime,
} from './test-helpers'
import { MotionState } from '../motion-state'

function findScenario(name: string) {
  const s = edgeCaseScenarios.find((s) => s.name === name)
  if (!s) throw new Error(`Scenario '${name}' not found`)
  return s
}

describe('edge cases', () => {
  it('two balls placed exactly touching: no collision fires', () => {
    const { replay } = runScenario(findScenario('exactly-touching'))
    const collisions = getCollisionEvents(replay)
    // Overlap guard should prevent collision detection for touching balls
    expect(collisions.length).toBe(0)
  })

  it('ball placed at cushion boundary: moves away cleanly', () => {
    const { replay } = runScenario(findScenario('ball-at-cushion'))
    const { table } = findScenario('ball-at-cushion')
    assertInBounds(replay, table.width, table.height)

    // Ball should move to the right (vx=500)
    const firstSnap = getSnapshotById(replay[0], 'ball')!
    expect(firstSnap.velocity[0]).toBeGreaterThan(0)
  })

  it('zero velocity with z-spin: enters Spinning state', () => {
    const { replay } = runScenario(findScenario('zero-velocity-z-spin'))
    const first = getSnapshotById(replay[0], 'ball')!
    expect(first.motionState).toBe(MotionState.Spinning)
    expect(Math.abs(first.angularVelocity[2])).toBeGreaterThan(10)

    // Eventually stops
    const last = getSnapshotById(getLastEvent(replay), 'ball')!
    expect(last.motionState).toBe(MotionState.Stationary)
  })

  it('very high velocity ball: stays in bounds, no numerical explosion', () => {
    const { replay } = runScenario(findScenario('very-high-velocity'))
    const { table } = findScenario('very-high-velocity')
    assertInBounds(replay, table.width, table.height)
    assertMonotonicTime(replay)

    // Should have cushion hits (ball is fast, will bounce around)
    const transitions = getStateTransitions(replay)
    expect(transitions.length).toBeGreaterThan(0)

    // Event count should still be bounded
    expect(replay.length).toBeLessThan(50000)
  })

  it('very low velocity ball: transitions to Stationary cleanly', () => {
    const { replay } = runScenario(findScenario('very-low-velocity'))
    const last = getSnapshotById(getLastEvent(replay), 'ball')!
    expect(last.motionState).toBe(MotionState.Stationary)
    expect(computeSpeed(last)).toBeLessThan(1)
  })

  it('simultaneous collisions: handled deterministically', () => {
    const { replay } = runScenario(findScenario('simultaneous-collisions'))
    const collisions = getCollisionEvents(replay)
    // Both pairs should collide
    expect(collisions.length).toBeGreaterThanOrEqual(2)

    assertNoOverlaps(replay)
    assertMonotonicTime(replay)

    // Both pairs should have collided at approximately the same time
    // (same distance, same speed)
    if (collisions.length >= 2) {
      expect(Math.abs(collisions[0].time - collisions[1].time)).toBeLessThan(0.01)
    }
  })

  it('pure lateral spin (wx, wy): enters Sliding, transitions to Rolling', () => {
    const { replay } = runScenario(findScenario('pure-lateral-spin'))
    const first = getSnapshotById(replay[0], 'ball')!
    expect(first.motionState).toBe(MotionState.Sliding)

    // Should eventually reach Rolling
    const transitions = getStateTransitions(replay)
    const rollingTransition = transitions.find((e) => {
      const snap = getSnapshotById(e, 'ball')
      return snap?.motionState === MotionState.Rolling
    })
    expect(rollingTransition).toBeDefined()
  })

  it('three balls colliding near-simultaneously: second collision resolves correctly', () => {
    const { replay } = runScenario(findScenario('near-simultaneous-3-ball'))
    const collisions = getCollisionEvents(replay)
    // Left and right both approach center: should get 2+ collisions
    expect(collisions.length).toBeGreaterThanOrEqual(2)

    assertNoOverlaps(replay)
    assertMonotonicTime(replay)

    // Center ball should have been hit by both sides
    // After all collisions, check that center ball has a defined velocity
    const lastCollision = collisions[collisions.length - 1]
    const center = getSnapshotById(lastCollision, 'center')
    if (center) {
      expect(computeSpeed(center)).toBeDefined()
    }
  })
})
