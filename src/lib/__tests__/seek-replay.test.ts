/**
 * Test that seek + replay logic produces correct ball positions.
 * This mirrors what the main thread does when the user drags the timeline slider.
 */
import Ball from '../ball'
import { simulate, ReplayData, CircleSnapshot } from '../simulation'
import { defaultPhysicsConfig, zeroFrictionConfig } from '../physics-config'
import { createPoolPhysicsProfile, createSimple2DProfile } from '../physics/physics-profile'
import { findScenario } from '../scenarios'

/**
 * Mirrors the main thread's logic: create Ball objects from initial snapshot,
 * then implement seek (restore + replay + rebase) and verify positions.
 */
function testSeekPositions(scenarioName: string, seekTargets: number[]) {
  const scenario = findScenario(scenarioName)
  if (!scenario) throw new Error(`Scenario not found: ${scenarioName}`)

  // Determine physics
  let physicsConfig = defaultPhysicsConfig
  let profile = createPoolPhysicsProfile()
  if (scenario.physics === 'zero-friction') {
    physicsConfig = zeroFrictionConfig
    profile = createSimple2DProfile()
  } else if (scenario.physics === 'simple2d') {
    physicsConfig = defaultPhysicsConfig
    profile = createSimple2DProfile()
  }

  // Create balls and simulate (same as worker)
  const R = physicsConfig.defaultBallParams.radius
  const simBalls = scenario.balls.map((spec) => {
    const ball = new Ball(
      [spec.x, spec.y, 0],
      [spec.vx ?? 0, spec.vy ?? 0, spec.vz ?? 0],
      R,
      0,
      physicsConfig.defaultBallParams.mass,
      spec.id,
      spec.spin ? [...spec.spin] : [0, 0, 0],
      { ...physicsConfig.defaultBallParams },
      physicsConfig,
    )
    ball.updateTrajectory(profile, physicsConfig)
    return ball
  })

  const allReplay = simulate(
    scenario.table.width,
    scenario.table.height,
    scenario.duration,
    simBalls,
    physicsConfig,
    profile,
  )

  // Split like the worker does
  const initialValues = allReplay.shift()!
  const events = allReplay

  // --- Create main thread balls (mirrors index.ts worker response handler) ---
  const state: Record<string, Ball> = {}
  for (const snapshot of initialValues.snapshots) {
    const ball = new Ball(
      snapshot.position,
      snapshot.velocity,
      snapshot.radius,
      snapshot.time,
      physicsConfig.defaultBallParams.mass,
      snapshot.id,
      snapshot.angularVelocity,
    )
    if (snapshot.trajectoryA) {
      ball.trajectory.a[0] = snapshot.trajectoryA[0]
      ball.trajectory.a[1] = snapshot.trajectoryA[1]
    }
    if (snapshot.motionState !== undefined) {
      ball.motionState = snapshot.motionState
    }
    state[snapshot.id] = ball
  }
  const circleIds = Object.keys(state)

  // Capture initial state (mirrors index.ts)
  const initialBallStates = new Map<
    string,
    {
      position: [number, number, number]
      velocity: [number, number, number]
      radius: number
      time: number
      angularVelocity: [number, number, number]
      motionState: number
      trajectoryA: [number, number]
    }
  >()
  for (const [id, ball] of Object.entries(state)) {
    initialBallStates.set(id, {
      position: [...ball.position] as [number, number, number],
      velocity: [...ball.velocity] as [number, number, number],
      radius: ball.radius,
      time: ball.time,
      angularVelocity: [...ball.angularVelocity] as [number, number, number],
      motionState: ball.motionState,
      trajectoryA: [ball.trajectory.a[0], ball.trajectory.a[1]],
    })
  }

  // Helpers (mirrors index.ts)
  function restoreInitialState() {
    for (const [id, snap] of initialBallStates) {
      const ball = state[id]
      ball.position[0] = snap.position[0]
      ball.position[1] = snap.position[1]
      ball.position[2] = 0
      ball.velocity[0] = snap.velocity[0]
      ball.velocity[1] = snap.velocity[1]
      ball.velocity[2] = 0
      ball.radius = snap.radius
      ball.time = snap.time
      ball.angularVelocity = [...snap.angularVelocity]
      ball.motionState = snap.motionState
      ball.trajectory.a[0] = snap.trajectoryA[0]
      ball.trajectory.a[1] = snap.trajectoryA[1]
      ball.trajectory.b[0] = snap.velocity[0]
      ball.trajectory.b[1] = snap.velocity[1]
      ball.trajectory.c[0] = snap.position[0]
      ball.trajectory.c[1] = snap.position[1]
    }
  }

  function applyEventSnapshots(event: ReplayData) {
    for (const snapshot of event.snapshots) {
      const circle = state[snapshot.id]
      circle.position[0] = snapshot.position[0]
      circle.position[1] = snapshot.position[1]
      circle.velocity[0] = snapshot.velocity[0]
      circle.velocity[1] = snapshot.velocity[1]
      circle.radius = snapshot.radius
      circle.time = snapshot.time
      if (snapshot.angularVelocity) {
        circle.angularVelocity = [...snapshot.angularVelocity]
      }
      if (snapshot.motionState !== undefined) {
        circle.motionState = snapshot.motionState
      }
      circle.trajectory.a[0] = snapshot.trajectoryA[0]
      circle.trajectory.a[1] = snapshot.trajectoryA[1]
      circle.trajectory.b[0] = snapshot.velocity[0]
      circle.trajectory.b[1] = snapshot.velocity[1]
      circle.trajectory.c[0] = snapshot.position[0]
      circle.trajectory.c[1] = snapshot.position[1]
    }
  }

  // Compute reference positions: for each ball at each seek target,
  // find last event snapshot and evaluate trajectory
  function computeReferencePosition(ballId: string, targetTime: number): [number, number] {
    // Find last event involving this ball at or before targetTime
    let lastSnapshot: CircleSnapshot | null = null
    // Check initial values first
    const initSnap = initialValues.snapshots.find((s) => s.id === ballId)!
    lastSnapshot = initSnap

    for (const event of events) {
      if (event.time > targetTime) break
      const snap = event.snapshots.find((s) => s.id === ballId)
      if (snap) lastSnapshot = snap
    }

    // Evaluate trajectory at targetTime
    const dt = targetTime - lastSnapshot!.time
    const a = lastSnapshot!.trajectoryA
    const v = lastSnapshot!.velocity
    const p = lastSnapshot!.position
    return [a[0] * dt * dt + v[0] * dt + p[0], a[1] * dt * dt + v[1] * dt + p[1]]
  }

  // --- Test each seek target ---
  for (const target of seekTargets) {
    const eventsToApply = events.filter((e) => e.time <= target)

    restoreInitialState()
    for (const event of eventsToApply) {
      applyEventSnapshots(event)
    }

    // Rebase (mirrors the fix in index.ts)
    for (const id of circleIds) {
      const ball = state[id]
      const dt = target - ball.time
      if (dt > 1e-9) {
        const pos = ball.positionAtTime(target)
        const vel = ball.velocityAtTime(target)
        ball.position[0] = pos[0]
        ball.position[1] = pos[1]
        ball.velocity[0] = vel[0]
        ball.velocity[1] = vel[1]
        ball.time = target
        ball.trajectory.c[0] = pos[0]
        ball.trajectory.c[1] = pos[1]
        ball.trajectory.b[0] = vel[0]
        ball.trajectory.b[1] = vel[1]
      }
    }

    // Check positions
    for (const id of circleIds) {
      const ball = state[id]
      const pos = ball.positionAtTime(target)
      const ref = computeReferencePosition(id, target)

      const dx = Math.abs(pos[0] - ref[0])
      const dy = Math.abs(pos[1] - ref[1])

      expect(dx).toBeLessThan(
        0.01,
        `Ball ${id} X mismatch at t=${target}: got ${pos[0].toFixed(4)}, expected ${ref[0].toFixed(4)} (ball.time=${ball.time.toFixed(6)})`,
      )
      expect(dy).toBeLessThan(
        0.01,
        `Ball ${id} Y mismatch at t=${target}: got ${pos[1].toFixed(4)}, expected ${ref[1].toFixed(4)} (ball.time=${ball.time.toFixed(6)})`,
      )

      // Also check ball is within table bounds
      expect(pos[0]).toBeGreaterThanOrEqual(-ball.radius)
      expect(pos[0]).toBeLessThanOrEqual(scenario.table.width + ball.radius)
      expect(pos[1]).toBeGreaterThanOrEqual(-ball.radius)
      expect(pos[1]).toBeLessThanOrEqual(scenario.table.height + ball.radius)
    }
  }
}

describe('seek-replay', () => {
  it('single ball sliding deceleration: seek positions match reference', () => {
    testSeekPositions('sliding-deceleration', [0.05, 0.1, 0.2, 0.5, 1.0])
  })

  it('head-on collision: seek positions match reference', () => {
    testSeekPositions('head-on-equal-mass', [0.05, 0.1, 0.3, 0.5, 1.0])
  })

  it('triangle break 15 balls: seek positions match reference', () => {
    testSeekPositions('triangle-break-15', [0.1, 0.3, 0.5, 1.0, 2.0, 3.0])
  })

  it('Newton cradle: seek positions match reference', () => {
    testSeekPositions('newtons-cradle-3', [0.05, 0.1, 0.2, 0.5, 1.0])
  })

  it('multiple balls to rest: seek positions match reference', () => {
    testSeekPositions('multiple-balls-to-rest', [0.1, 0.5, 1.0, 2.0, 3.0])
  })
})
