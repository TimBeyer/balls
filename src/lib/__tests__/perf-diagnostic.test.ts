/**
 * Performance diagnostic test.
 *
 * Creates a realistic 22-ball pool simulation, runs it for 30 seconds,
 * and reports event counts and wall-clock time to help identify
 * performance bottlenecks.
 *
 * Also includes targeted tests for potential infinite-bounce / oscillation issues:
 * - Airborne landing threshold (vZ bouncing near the 10 mm/s cutoff)
 * - Cushion-triggered airborne transitions
 * - Rapid state flipping between Airborne and surface states
 */
import { describe, it, expect } from 'vitest'
import { simulate, EventType } from '../simulation'
import Ball from '../ball'
import { defaultPhysicsConfig, defaultBallParams } from '../physics-config'
import { createPoolPhysicsProfile, determinePoolMotionState } from '../physics/physics-profile'
import { MotionState } from '../motion-state'

// Standard pool table dimensions in mm (9-foot table ~ 2540 x 1270)
const TABLE_WIDTH = 2540
const TABLE_HEIGHT = 1270
const BALL_RADIUS = 37.5

function createPoolBall(
  x: number,
  y: number,
  vx: number,
  vy: number,
  id?: string,
  vz: number = 0,
  angVel: [number, number, number] = [0, 0, 0],
): Ball {
  const params = { ...defaultBallParams, radius: BALL_RADIUS }
  return new Ball(
    [x, y, 0],
    [vx, vy, vz],
    BALL_RADIUS,
    0,
    params.mass,
    id,
    angVel,
    params,
    defaultPhysicsConfig,
  )
}

/**
 * Place 22 balls in a snooker-ish triangle + cue ball, give the cue ball
 * a strong initial velocity to simulate a break shot.
 */
function createBreakSetup(): Ball[] {
  const balls: Ball[] = []
  const cx = TABLE_WIDTH * 0.7
  const cy = TABLE_HEIGHT / 2
  const d = BALL_RADIUS * 2 + 1 // diameter + small gap

  // Triangle rack: 5 rows (1+2+3+4+5 = 15 balls)
  let id = 1
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const x = cx + row * d * Math.cos(Math.PI / 6)
      const y = cy + (col - row / 2) * d
      balls.push(createPoolBall(x, y, 0, 0, `ball-${id++}`))
    }
  }

  // Extra balls spread around the table (to reach 22 total = 21 object balls + 1 cue)
  const extras = [
    [TABLE_WIDTH * 0.3, TABLE_HEIGHT * 0.25],
    [TABLE_WIDTH * 0.3, TABLE_HEIGHT * 0.75],
    [TABLE_WIDTH * 0.5, TABLE_HEIGHT * 0.2],
    [TABLE_WIDTH * 0.5, TABLE_HEIGHT * 0.8],
    [TABLE_WIDTH * 0.15, TABLE_HEIGHT * 0.5],
    [TABLE_WIDTH * 0.85, TABLE_HEIGHT * 0.25],
  ]
  for (const [ex, ey] of extras) {
    balls.push(createPoolBall(ex, ey, 0, 0, `ball-${id++}`))
  }

  // Cue ball — strong break shot aimed at the rack
  balls.push(createPoolBall(TABLE_WIDTH * 0.25, TABLE_HEIGHT / 2, 3000, 50, 'cue'))

  return balls
}

describe('Performance Diagnostic', () => {
  it('22-ball break shot — 30s simulation event profile', () => {
    const profile = createPoolPhysicsProfile()
    const balls = createBreakSetup()
    expect(balls.length).toBe(22)

    const startMs = performance.now()
    const replay = simulate(TABLE_WIDTH, TABLE_HEIGHT, 30, balls, defaultPhysicsConfig, profile)
    const elapsedMs = performance.now() - startMs

    // Count events by type
    let circleCollisions = 0
    let cushionCollisions = 0
    let stateTransitions = 0
    let stateUpdates = 0

    for (const event of replay) {
      switch (event.type) {
        case EventType.CircleCollision:
          circleCollisions++
          break
        case EventType.CushionCollision:
          cushionCollisions++
          break
        case EventType.StateTransition:
          stateTransitions++
          break
        case EventType.StateUpdate:
          stateUpdates++
          break
      }
    }

    // Count state transitions by type (from snapshot motionState)
    const transitionStates: Record<string, number> = {}
    for (const event of replay) {
      if (event.type === EventType.StateTransition) {
        for (const snap of event.snapshots) {
          const key = snap.motionState
          transitionStates[key] = (transitionStates[key] || 0) + 1
        }
      }
    }

    // Count how many times each motion state appears after cushion collisions
    const postCushionStates: Record<string, number> = {}
    for (const event of replay) {
      if (event.type === EventType.CushionCollision) {
        for (const snap of event.snapshots) {
          const key = snap.motionState
          postCushionStates[key] = (postCushionStates[key] || 0) + 1
        }
      }
    }

    // Look for rapid-fire events (events very close together in time)
    let rapidFireCount = 0
    const rapidFireThreshold = 1e-6 // events within 1 microsecond
    for (let i = 1; i < replay.length; i++) {
      const dt = replay[i].time - replay[i - 1].time
      if (dt < rapidFireThreshold && dt >= 0) {
        rapidFireCount++
      }
    }

    // Check for airborne-related patterns: Airborne state transitions
    let airborneTransitions = 0
    let airborneToSlidingCount = 0
    for (let i = 1; i < replay.length; i++) {
      if (replay[i].type === EventType.StateTransition) {
        for (const snap of replay[i].snapshots) {
          if (snap.motionState === MotionState.Airborne) {
            airborneTransitions++
          }
        }
      }
      // Look for Cushion -> StateTransition(Airborne) -> StateTransition(Sliding) pattern
      if (
        i >= 2 &&
        replay[i - 2].type === EventType.CushionCollision &&
        replay[i - 1].type === EventType.StateTransition &&
        replay[i - 1].snapshots.some((s) => s.motionState === MotionState.Airborne) &&
        replay[i].type === EventType.StateTransition &&
        replay[i].snapshots.some(
          (s) => s.motionState === MotionState.Sliding || s.motionState === MotionState.Rolling,
        )
      ) {
        airborneToSlidingCount++
      }
    }

    // Time distribution: events per second bucket
    const bucketSize = 1 // 1 second buckets
    const buckets: number[] = new Array(31).fill(0)
    for (const event of replay) {
      const bucket = Math.min(30, Math.floor(event.time / bucketSize))
      buckets[bucket]++
    }

    const totalEvents = replay.length

    console.log('\n=== PERFORMANCE DIAGNOSTIC RESULTS (22-ball break) ===')
    console.log(`Wall-clock time:         ${elapsedMs.toFixed(1)} ms`)
    console.log(`Total events:            ${totalEvents}`)
    console.log(`  Circle collisions:     ${circleCollisions}`)
    console.log(`  Cushion collisions:    ${cushionCollisions}`)
    console.log(`  State transitions:     ${stateTransitions}`)
    console.log(`  State updates:         ${stateUpdates}`)
    console.log(`Events per sim-second:   ${(totalEvents / 30).toFixed(1)}`)
    console.log(`Rapid-fire events (<1us gap): ${rapidFireCount}`)
    console.log('')
    console.log('State transition targets:')
    for (const [state, count] of Object.entries(transitionStates)) {
      console.log(`  -> ${state}: ${count}`)
    }
    console.log('')
    console.log('Post-cushion motion states:')
    for (const [state, count] of Object.entries(postCushionStates)) {
      console.log(`  ${state}: ${count}`)
    }
    console.log('')
    console.log(`Airborne state transitions:     ${airborneTransitions}`)
    console.log(`Cushion->Airborne->Land patterns: ${airborneToSlidingCount}`)
    console.log('')
    console.log('Events per second (time distribution):')
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i] > 0) {
        const bar = '#'.repeat(Math.min(80, Math.ceil(buckets[i] / 10)))
        console.log(`  [${i.toString().padStart(2)}s] ${buckets[i].toString().padStart(6)} ${bar}`)
      }
    }
    console.log('=== END DIAGNOSTIC ===\n')

    // Sanity: the simulation should have produced events
    expect(totalEvents).toBeGreaterThan(0)
    // Log a warning if event count seems excessive
    if (totalEvents > 50000) {
      console.warn(`WARNING: ${totalEvents} events in 30s seems excessive for 22 balls!`)
    }
  })

  it('airborne bounce decay — check for infinite bouncing near vZ=10 threshold', () => {
    const profile = createPoolPhysicsProfile()
    // Ball with a small upward velocity that should trigger airborne landing logic.
    // eTableRestitution=0.5, threshold=10 mm/s.
    // vZ=25 -> bounce: 12.5 (>10, stays airborne) -> 6.25 (<10, settles). Should be 2 bounces.
    const ball = createPoolBall(TABLE_WIDTH / 2, TABLE_HEIGHT / 2, 500, 0, 'airborne-test', 25)

    const startMs = performance.now()
    const replay = simulate(TABLE_WIDTH, TABLE_HEIGHT, 10, [ball], defaultPhysicsConfig, profile)
    const elapsedMs = performance.now() - startMs

    let airborneCount = 0
    let landingCount = 0
    for (const event of replay) {
      if (event.type === EventType.StateTransition) {
        for (const snap of event.snapshots) {
          if (snap.motionState === MotionState.Airborne) airborneCount++
          if (snap.motionState === MotionState.Sliding || snap.motionState === MotionState.Rolling)
            landingCount++
        }
      }
    }

    console.log('\n=== AIRBORNE BOUNCE DECAY TEST ===')
    console.log(`Wall-clock time:     ${elapsedMs.toFixed(1)} ms`)
    console.log(`Total events:        ${replay.length}`)
    console.log(`Airborne entries:    ${airborneCount}`)
    console.log(`Landing entries:     ${landingCount}`)
    console.log('=== END ===\n')

    // Should NOT have excessive airborne transitions (infinite bouncing)
    expect(airborneCount).toBeLessThan(20)
    expect(replay.length).toBeLessThan(500)
  })

  it('cushion hit with spin — check for airborne oscillation', () => {
    const profile = createPoolPhysicsProfile()
    // Ball aimed at a cushion with significant spin — Han 2005 model
    // can produce upward vZ, potentially triggering airborne state
    const ball = createPoolBall(
      TABLE_WIDTH / 2,
      TABLE_HEIGHT - BALL_RADIUS - 50, // near north cushion
      0,
      1500, // heading toward north cushion
      'spin-cushion-test',
      0,
      [0, 0, 100], // z-spin
    )

    const startMs = performance.now()
    const replay = simulate(TABLE_WIDTH, TABLE_HEIGHT, 10, [ball], defaultPhysicsConfig, profile)
    const elapsedMs = performance.now() - startMs

    let cushionHits = 0
    let airborneCount = 0
    const eventTypes: string[] = []
    for (const event of replay) {
      if (event.type === EventType.CushionCollision) cushionHits++
      if (event.type === EventType.StateTransition) {
        for (const snap of event.snapshots) {
          if (snap.motionState === MotionState.Airborne) airborneCount++
        }
      }
      eventTypes.push(event.type)
    }

    console.log('\n=== CUSHION + SPIN TEST ===')
    console.log(`Wall-clock time:     ${elapsedMs.toFixed(1)} ms`)
    console.log(`Total events:        ${replay.length}`)
    console.log(`Cushion hits:        ${cushionHits}`)
    console.log(`Airborne transitions: ${airborneCount}`)
    console.log(`First 30 event types: ${eventTypes.slice(0, 30).join(', ')}`)
    console.log('=== END ===\n')

    expect(replay.length).toBeLessThan(5000)
  })

  it('determinePoolMotionState — tiny vZ near threshold', () => {
    // Test whether determinePoolMotionState can cause flipping with tiny vZ values
    const R = BALL_RADIUS
    const threshold = 1e-6

    // vZ just above threshold -> Airborne
    const state1 = determinePoolMotionState([100, 0, threshold * 2], [0, 0, 0], R)
    expect(state1).toBe(MotionState.Airborne)

    // vZ just below threshold -> NOT Airborne (should be Sliding or Rolling)
    const state2 = determinePoolMotionState([100, 0, threshold * 0.5], [0, 0, 0], R)
    expect(state2).not.toBe(MotionState.Airborne)

    // vZ = 0 with horizontal velocity -> Sliding (no rolling constraint)
    const state3 = determinePoolMotionState([100, 0, 0], [0, 0, 0], R)
    expect(state3).toBe(MotionState.Sliding)

    // After airborne landing with vzBounce exactly at 10 boundary:
    // applyTransition sets vZ=0 when vzBounce <= 10
    // So if vZ was -20 at landing, vzBounce = 20*0.5 = 10, which is NOT > 10
    // So ball settles (vZ=0). Good — no infinite bounce at boundary.
    console.log('\n=== determinePoolMotionState threshold check ===')
    console.log(`vZ=${threshold * 2} -> ${state1}`)
    console.log(`vZ=${threshold * 0.5} -> ${state2}`)
    console.log(`vZ=0, speed=100 -> ${state3}`)

    // Check the exact boundary: vzBounce = 10 should NOT stay airborne
    // In airborne-motion.ts line 76: if (vzBounce > 10) => strict greater-than
    // So vzBounce=10 goes to else branch (settled). This is correct.
    // But vzBounce=10.0001 stays airborne -> next bounce: 10.0001*0.5=5.0 -> settled.
    // Max 2 extra bounces for any value near the boundary. No infinite loop.
    console.log('Airborne bounce threshold is strict >10, so vzBounce=10 settles. No infinite loop.')
    console.log('=== END ===\n')
  })

  it('22-ball break with spin — stress test for airborne events', () => {
    const profile = createPoolPhysicsProfile()
    const balls: Ball[] = []
    const cx = TABLE_WIDTH * 0.7
    const cy = TABLE_HEIGHT / 2
    const d = BALL_RADIUS * 2 + 1

    // Triangle rack with some initial spin to stress airborne logic
    let id = 1
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const x = cx + row * d * Math.cos(Math.PI / 6)
        const y = cy + (col - row / 2) * d
        balls.push(createPoolBall(x, y, 0, 0, `s-ball-${id++}`, 0, [0, 0, 5]))
      }
    }

    // Extra balls
    const extras = [
      [TABLE_WIDTH * 0.3, TABLE_HEIGHT * 0.25],
      [TABLE_WIDTH * 0.3, TABLE_HEIGHT * 0.75],
      [TABLE_WIDTH * 0.5, TABLE_HEIGHT * 0.2],
      [TABLE_WIDTH * 0.5, TABLE_HEIGHT * 0.8],
      [TABLE_WIDTH * 0.15, TABLE_HEIGHT * 0.5],
      [TABLE_WIDTH * 0.85, TABLE_HEIGHT * 0.25],
    ]
    for (const [ex, ey] of extras) {
      balls.push(createPoolBall(ex, ey, 0, 0, `s-ball-${id++}`, 0, [0, 0, 5]))
    }

    // Cue ball with side-spin and masse (upward vZ component)
    balls.push(createPoolBall(TABLE_WIDTH * 0.25, TABLE_HEIGHT / 2, 3000, 50, 's-cue', 15, [10, -5, 50]))

    expect(balls.length).toBe(22)

    const startMs = performance.now()
    const replay = simulate(TABLE_WIDTH, TABLE_HEIGHT, 30, balls, defaultPhysicsConfig, profile)
    const elapsedMs = performance.now() - startMs

    let circleCollisions = 0
    let cushionCollisions = 0
    let stateTransitions = 0
    let airborneTransitions = 0

    for (const event of replay) {
      switch (event.type) {
        case EventType.CircleCollision:
          circleCollisions++
          break
        case EventType.CushionCollision:
          cushionCollisions++
          break
        case EventType.StateTransition:
          stateTransitions++
          for (const snap of event.snapshots) {
            if (snap.motionState === MotionState.Airborne) airborneTransitions++
          }
          break
      }
    }

    console.log('\n=== 22-BALL BREAK WITH SPIN (stress test) ===')
    console.log(`Wall-clock time:         ${elapsedMs.toFixed(1)} ms`)
    console.log(`Total events:            ${replay.length}`)
    console.log(`  Circle collisions:     ${circleCollisions}`)
    console.log(`  Cushion collisions:    ${cushionCollisions}`)
    console.log(`  State transitions:     ${stateTransitions}`)
    console.log(`  Airborne transitions:  ${airborneTransitions}`)
    console.log(`Events per sim-second:   ${(replay.length / 30).toFixed(1)}`)
    console.log('=== END ===\n')

    // Even with spin, should not produce excessive events
    expect(replay.length).toBeLessThan(50000)
    if (replay.length > 10000) {
      console.warn(`WARNING: ${replay.length} events with spin — potential oscillation issue!`)
    }
  })
})
