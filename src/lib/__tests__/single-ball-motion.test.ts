import { describe, it, expect } from 'vitest'
import { singleBallScenarios } from '../scenarios'
import {
  runScenario,
  getStateTransitions,
  getSnapshotById,
  getLastEvent,
  computeSpeed,
} from './test-helpers'
import { MotionState } from '../motion-state'
import { defaultBallParams, defaultPhysicsConfig } from '../physics-config'

const R = defaultBallParams.radius
const mu = defaultBallParams.muSliding
const muR = defaultBallParams.muRolling
const g = defaultPhysicsConfig.gravity

function findScenario(name: string) {
  const s = singleBallScenarios.find((s) => s.name === name)
  if (!s) throw new Error(`Scenario '${name}' not found`)
  return s
}

describe('single ball motion', () => {
  it('stationary ball stays put', () => {
    const { replay } = runScenario(findScenario('stationary-ball'))
    const first = getSnapshotById(replay[0], 'ball')!
    const last = getSnapshotById(getLastEvent(replay), 'ball')!
    expect(last.position[0]).toBeCloseTo(first.position[0], 1)
    expect(last.position[1]).toBeCloseTo(first.position[1], 1)
    expect(last.motionState).toBe(MotionState.Stationary)
  })

  it('constant velocity with zero friction', () => {
    const { replay } = runScenario(findScenario('constant-velocity'))
    // Ball at x=500, vx=200, after some time should have moved linearly
    const first = getSnapshotById(replay[0], 'ball')!
    expect(first.velocity[0]).toBeCloseTo(200, 0)
    // With zero friction in simple2d profile, ball just bounces off walls at constant speed
    const last = getSnapshotById(getLastEvent(replay), 'ball')!
    const speed = computeSpeed(last)
    expect(speed).toBeCloseTo(200, 0) // speed preserved
  })

  it('sliding ball decelerates', () => {
    const { replay } = runScenario(findScenario('sliding-deceleration'))
    const first = getSnapshotById(replay[0], 'ball')!
    const initialSpeed = computeSpeed(first)
    // Find a state transition event
    const transitions = getStateTransitions(replay)
    expect(transitions.length).toBeGreaterThan(0)
    // At some point the ball should be slower
    const midEvent = replay[Math.floor(replay.length / 2)]
    const midSnap = getSnapshotById(midEvent, 'ball')!
    if (midSnap.motionState !== MotionState.Stationary) {
      expect(computeSpeed(midSnap)).toBeLessThan(initialSpeed)
    }
  })

  it('sliding → rolling transition occurs', () => {
    const { replay } = runScenario(findScenario('sliding-to-rolling'))
    const transitions = getStateTransitions(replay)
    const rollingTransition = transitions.find((e) => {
      const snap = getSnapshotById(e, 'ball')
      return snap?.motionState === MotionState.Rolling
    })
    expect(rollingTransition).toBeDefined()

    // At rolling transition, verify rolling constraint: ωy ≈ vx/R
    const snap = getSnapshotById(rollingTransition!, 'ball')!
    const vx = snap.velocity[0]
    const wy = snap.angularVelocity[1]
    expect(wy).toBeCloseTo(vx / R, 0)
  })

  it('rolling → stationary transition', () => {
    const { replay } = runScenario(findScenario('rolling-to-stationary'))
    const last = getSnapshotById(getLastEvent(replay), 'ball')!
    expect(last.motionState).toBe(MotionState.Stationary)
    expect(computeSpeed(last)).toBeLessThan(1)
  })

  it('ball with sidespin: spinning state invariants hold if spinning occurs', () => {
    const { replay } = runScenario(findScenario('rolling-to-spinning-to-stationary'))
    const transitions = getStateTransitions(replay)

    // Should have at least one state transition
    expect(transitions.length).toBeGreaterThanOrEqual(1)

    // Check if Spinning state appears. Whether it does depends on whether z-spin
    // outlasts linear speed — both outcomes are valid given quiescence thresholds.
    const spinEvent = replay.find((e) =>
      e.snapshots.some((s) => s.id === 'ball' && s.motionState === MotionState.Spinning),
    )

    if (spinEvent) {
      const snap = getSnapshotById(spinEvent, 'ball')!
      // During Spinning: linear velocity should be ~0
      expect(computeSpeed(snap)).toBeLessThan(5)
      // During Spinning: only wz should be nonzero (wx≈0, wy≈0)
      expect(Math.abs(snap.angularVelocity[0])).toBeLessThan(1)
      expect(Math.abs(snap.angularVelocity[1])).toBeLessThan(1)
      expect(Math.abs(snap.angularVelocity[2])).toBeGreaterThan(0.1)
    }

    // Eventually reaches stationary
    const last = getSnapshotById(getLastEvent(replay), 'ball')!
    expect(last.motionState).toBe(MotionState.Stationary)
  })

  it('spinning → stationary: pure z-spin decays with correct invariants', () => {
    const { replay } = runScenario(findScenario('spinning-to-stationary'))
    const first = getSnapshotById(replay[0], 'ball')!
    expect(first.motionState).toBe(MotionState.Spinning)
    expect(Math.abs(first.angularVelocity[2])).toBeGreaterThan(10)

    // During Spinning: vx=0, vy=0, ωx=0, ωy=0
    expect(first.velocity[0]).toBeCloseTo(0, 1)
    expect(first.velocity[1]).toBeCloseTo(0, 1)
    expect(first.angularVelocity[0]).toBeCloseTo(0, 1)
    expect(first.angularVelocity[1]).toBeCloseTo(0, 1)

    const last = getSnapshotById(getLastEvent(replay), 'ball')!
    expect(last.motionState).toBe(MotionState.Stationary)
    // All angular velocity components should be zero at stationary
    expect(last.angularVelocity[0]).toBeCloseTo(0, 1)
    expect(last.angularVelocity[1]).toBeCloseTo(0, 1)
    expect(last.angularVelocity[2]).toBeCloseTo(0, 1)
  })

  it('pure backspin creates sliding state', () => {
    const { replay } = runScenario(findScenario('pure-backspin'))
    const first = getSnapshotById(replay[0], 'ball')!
    // Ball should start in sliding state (backspin opposes rolling constraint)
    expect(first.motionState).toBe(MotionState.Sliding)
    // Should eventually transition to rolling or stationary
    const last = getSnapshotById(getLastEvent(replay), 'ball')!
    expect([MotionState.Stationary, MotionState.Rolling, MotionState.Spinning]).toContain(last.motionState)
  })

  it('pure topspin creates sliding state', () => {
    const { replay } = runScenario(findScenario('pure-topspin'))
    const first = getSnapshotById(replay[0], 'ball')!
    // Extra topspin means spin exceeds rolling constraint → sliding
    expect(first.motionState).toBe(MotionState.Sliding)
  })

  it('sliding transition time approximately matches formula', () => {
    const { replay } = runScenario(findScenario('sliding-to-rolling'))
    const transitions = getStateTransitions(replay)
    const rollingTransition = transitions.find((e) => {
      const snap = getSnapshotById(e, 'ball')
      return snap?.motionState === MotionState.Rolling
    })
    expect(rollingTransition).toBeDefined()

    // Formula: dt = (2/7) * relSpeed / (μ * g)
    // Initial relative velocity for a ball with vx=500, no spin:
    // u_rel = [vx - R*ωy, vy + R*ωx] = [500, 0] (since ω=0)
    const relSpeed = 500
    const expectedDt = (2 / 7) * (relSpeed / (mu * g))
    expect(rollingTransition!.time).toBeCloseTo(expectedDt, 1)
  })

  it('rolling transition time approximately matches formula', () => {
    const { replay } = runScenario(findScenario('rolling-to-stationary'))
    // Find the rolling → stationary transition
    const transitions = getStateTransitions(replay)
    const stationaryTransition = transitions.find((e) => {
      const snap = getSnapshotById(e, 'ball')
      return snap?.motionState === MotionState.Stationary
    })

    if (stationaryTransition) {
      // Find the rolling start time
      const rollingStart = transitions.find((e) => {
        const snap = getSnapshotById(e, 'ball')
        return snap?.motionState === MotionState.Rolling
      })
      if (rollingStart) {
        const rollingSnap = getSnapshotById(rollingStart, 'ball')!
        const rollingSpeed = computeSpeed(rollingSnap)
        // Formula: dt = speed / (μ_rolling * g)
        const expectedDt = rollingSpeed / (muR * g)
        const actualDt = stationaryTransition.time - rollingStart.time
        // Allow generous tolerance since the ball might go through Spinning
        expect(actualDt).toBeCloseTo(expectedDt, 0)
      }
    }
  })

  it('diagonal sliding → rolling enforces 2D rolling constraint', () => {
    const { replay } = runScenario(findScenario('sliding-diagonal'))
    const transitions = getStateTransitions(replay)

    const rollingTransition = transitions.find((e) => {
      const snap = getSnapshotById(e, 'ball')
      return snap?.motionState === MotionState.Rolling
    })
    expect(rollingTransition).toBeDefined()

    const snap = getSnapshotById(rollingTransition!, 'ball')!
    const vx = snap.velocity[0]
    const vy = snap.velocity[1]
    // Rolling constraint: ωx = -vy/R, ωy = vx/R
    expect(snap.angularVelocity[0]).toBeCloseTo(-vy / R, 0)
    expect(snap.angularVelocity[1]).toBeCloseTo(vx / R, 0)
  })

  it('all balls reach stationary with friction', () => {
    const { replay } = runScenario(findScenario('multiple-balls-to-rest'))
    const lastEvent = getLastEvent(replay)
    for (const snap of lastEvent.snapshots) {
      expect(snap.motionState).toBe(MotionState.Stationary)
    }
  })
})
