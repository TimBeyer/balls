import { describe, it, expect } from 'vitest'
import { simulate, EventType } from '../simulation'
import { generateCircles } from '../generate-circles'
import Ball from '../ball'
import { createTestBall, zeroFrictionConfig } from './test-helpers'
import { defaultPhysicsConfig } from '../physics-config'
import { createPoolPhysicsProfile } from '../physics/physics-profile'
import { MotionState } from '../motion-state'

describe('simulate', () => {
  it('head-on collision: two circles should bounce back', () => {
    const radius = 10
    const c1 = createTestBall([100, 100], [1, 0], radius, 0)
    const c2 = createTestBall([200, 100], [-1, 0], radius, 0)
    const replay = simulate(1000, 500, 100, [c1, c2], zeroFrictionConfig)

    const circleCollisions = replay.filter((r) => r.type === EventType.CircleCollision)
    expect(circleCollisions.length).toBeGreaterThanOrEqual(1)

    const firstCollision = circleCollisions[0]
    const snap1 = firstCollision.snapshots.find((s) => s.id === c1.id)!
    const snap2 = firstCollision.snapshots.find((s) => s.id === c2.id)!
    expect(snap1.velocity[0]).toBeCloseTo(-1, 5)
    expect(snap2.velocity[0]).toBeCloseTo(1, 5)
  })

  it('no circles should overlap at any collision event', () => {
    const radius = 10
    const circles = [
      createTestBall([200, 250], [1, 0], radius, 0),
      createTestBall([400, 250], [-1, 0], radius, 0),
      createTestBall([300, 150], [0, 1], radius, 0),
      createTestBall([300, 350], [0, -1], radius, 0),
    ]
    const replay = simulate(1000, 500, 200, circles, zeroFrictionConfig)

    const circleCollisions = replay.filter((r) => r.type === EventType.CircleCollision)
    for (const event of circleCollisions) {
      const [s1, s2] = event.snapshots
      const dx = s1.position[0] - s2.position[0]
      const dy = s1.position[1] - s2.position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const expectedDist = s1.radius + s2.radius
      expect(dist).toBeCloseTo(expectedDist, 1)
    }
  })

  it('circles should not escape the table bounds', () => {
    const tableWidth = 500
    const tableHeight = 300
    const radius = 10
    const circles = [
      createTestBall([100, 150], [1.3, 0.7], radius, 0),
      createTestBall([400, 150], [-0.8, 0.5], radius, 0),
      createTestBall([250, 100], [0.3, -1.1], radius, 0),
    ]
    const replay = simulate(tableWidth, tableHeight, 500, circles, zeroFrictionConfig)

    for (const event of replay) {
      for (const snap of event.snapshots) {
        expect(snap.position[0]).toBeGreaterThanOrEqual(snap.radius - 1)
        expect(snap.position[0]).toBeLessThanOrEqual(tableWidth - snap.radius + 1)
        expect(snap.position[1]).toBeGreaterThanOrEqual(snap.radius - 1)
        expect(snap.position[1]).toBeLessThanOrEqual(tableHeight - snap.radius + 1)
      }
    }
  })

  it('many circles: no overlaps at collision events', () => {
    const radius = 10
    const tableWidth = 1000
    const tableHeight = 500
    const circles = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const x = 100 + col * 80
        const y = 100 + row * 80
        const vx = (col - 2) * 0.5 + 0.1
        const vy = (row - 1) * 0.5 + 0.1
        circles.push(createTestBall([x, y], [vx, vy], radius, 0))
      }
    }

    const replay = simulate(tableWidth, tableHeight, 1000, circles, zeroFrictionConfig)
    const circleCollisions = replay.filter((r) => r.type === EventType.CircleCollision)

    expect(circleCollisions.length).toBeGreaterThan(0)

    for (const event of circleCollisions) {
      const [s1, s2] = event.snapshots
      const dx = s1.position[0] - s2.position[0]
      const dy = s1.position[1] - s2.position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const expectedDist = s1.radius + s2.radius
      expect(dist).toBeGreaterThanOrEqual(expectedDist - 0.1)
    }
  })

  it('150 generated circles: no overlaps detected at collision events', () => {
    let s = 42
    const seededRandom = () => {
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const circles = generateCircles(150, 2840, 1420, seededRandom, zeroFrictionConfig)
    // Use zero friction so low-velocity test balls don't stop instantly
    const replay = simulate(2840, 1420, 10000, circles, zeroFrictionConfig)

    const circleCollisions = replay.filter((r: { type: EventType }) => r.type === EventType.CircleCollision)
    // With friction, balls slow down so there may be fewer collisions.
    // Still expect some collisions given 150 balls in close proximity.
    expect(circleCollisions.length).toBeGreaterThan(0)

    let overlaps = 0
    for (const event of circleCollisions) {
      const [s1, s2] = event.snapshots
      const dx = s1.position[0] - s2.position[0]
      const dy = s1.position[1] - s2.position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const expectedDist = s1.radius + s2.radius
      if (dist < expectedDist - 1) overlaps++
    }
    expect(overlaps).toBe(0)
  })

  it('simulation time advances monotonically', () => {
    const radius = 10
    const circles = [
      createTestBall([100, 100], [1, 0.5], radius, 0),
      createTestBall([300, 100], [-1, 0.3], radius, 0),
    ]
    const replay = simulate(1000, 500, 200, circles, zeroFrictionConfig)

    for (let i = 1; i < replay.length; i++) {
      expect(replay[i].time).toBeGreaterThanOrEqual(replay[i - 1].time)
    }
  })

  it('balls stay within bounds with friction', () => {
    const tableWidth = 2840
    const tableHeight = 1420
    const R = 37.5
    const params = { ...defaultPhysicsConfig.defaultBallParams, radius: R }
    const balls = [
      new Ball([200, 200], [1000, 500], R, 0, params.mass, 'a', [0, 0, 0], params, defaultPhysicsConfig),
      new Ball([1500, 700], [-800, 600], R, 0, params.mass, 'b', [0, 0, 0], params, defaultPhysicsConfig),
      new Ball([2600, 1200], [-300, -900], R, 0, params.mass, 'c', [0, 0, 0], params, defaultPhysicsConfig),
    ]
    const replay = simulate(tableWidth, tableHeight, 60, balls, defaultPhysicsConfig)

    for (const event of replay) {
      for (const snap of event.snapshots) {
        expect(snap.position[0]).toBeGreaterThanOrEqual(R - 1)
        expect(snap.position[0]).toBeLessThanOrEqual(tableWidth - R + 1)
        expect(snap.position[1]).toBeGreaterThanOrEqual(R - 1)
        expect(snap.position[1]).toBeLessThanOrEqual(tableHeight - R + 1)
      }
    }

    // Should have cushion collisions
    const cushionHits = replay.filter((r) => r.type === EventType.CushionCollision)
    expect(cushionHits.length).toBeGreaterThan(0)
  })

  it('ball-ball collisions work with friction', () => {
    const R = 37.5
    const params = { ...defaultPhysicsConfig.defaultBallParams, radius: R }
    const balls = [
      new Ball([500, 500], [800, 0], R, 0, params.mass, 'a', [0, 0, 0], params, defaultPhysicsConfig),
      new Ball([800, 500], [-800, 0], R, 0, params.mass, 'b', [0, 0, 0], params, defaultPhysicsConfig),
    ]
    const replay = simulate(2840, 1420, 30, balls, defaultPhysicsConfig)
    const collisions = replay.filter((r) => r.type === EventType.CircleCollision)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    // At collision, balls should be touching (not overlapping)
    const first = collisions[0]
    const [s1, s2] = first.snapshots
    const dx = s1.position[0] - s2.position[0]
    const dy = s1.position[1] - s2.position[1]
    const dist = Math.sqrt(dx * dx + dy * dy)
    expect(dist).toBeCloseTo(R * 2, 0)
  })

  it('moving ball transfers momentum to stationary ball', () => {
    const R = 37.5
    const params = { ...defaultPhysicsConfig.defaultBallParams, radius: R }
    const moving = new Ball([300, 500], [800, 0], R, 0, params.mass, 'moving', [0, 0, 0], params, defaultPhysicsConfig)
    const stationary = new Ball(
      [300 + R * 2 + 50, 500],
      [0, 0],
      R,
      0,
      params.mass,
      'stationary',
      [0, 0, 0],
      params,
      defaultPhysicsConfig,
    )

    const replay = simulate(2840, 1420, 10, [moving, stationary], defaultPhysicsConfig)
    const collisions = replay.filter((r) => r.type === EventType.CircleCollision)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    const first = collisions[0]
    const movingSnap = first.snapshots.find((s) => s.id === 'moving')!
    const stationarySnap = first.snapshots.find((s) => s.id === 'stationary')!

    // Stationary ball must receive velocity in the +x direction
    expect(stationarySnap.velocity[0]).toBeGreaterThan(100)
    // Moving ball should have slowed down significantly
    expect(movingSnap.velocity[0]).toBeLessThan(stationarySnap.velocity[0])
  })

  it('angular velocity is preserved through ball-ball collisions', () => {
    const R = 37.5
    const params = { ...defaultPhysicsConfig.defaultBallParams, radius: R }
    // Give ball significant z-spin (as if from a cushion bounce)
    const spinner = new Ball(
      [400, 700],
      [600, 0],
      R,
      0,
      params.mass,
      'spinner',
      [0, 0, 50], // large z-spin
      params,
      defaultPhysicsConfig,
    )
    const target = new Ball(
      [400 + R * 2 + 30, 700],
      [0, 0],
      R,
      0,
      params.mass,
      'target',
      [0, 0, 0],
      params,
      defaultPhysicsConfig,
    )

    const replay = simulate(2840, 1420, 10, [spinner, target], defaultPhysicsConfig)
    const collisions = replay.filter((r) => r.type === EventType.CircleCollision)
    expect(collisions.length).toBeGreaterThanOrEqual(1)

    // Angular velocity is preserved unchanged through elastic ball-ball collisions.
    // Spinner keeps its z-spin, target stays at zero.
    const first = collisions[0]
    const spinnerSnap = first.snapshots.find((s) => s.id === 'spinner')!
    const targetSnap = first.snapshots.find((s) => s.id === 'target')!
    expect(Math.abs(spinnerSnap.angularVelocity[2])).toBeGreaterThan(10)
    expect(targetSnap.angularVelocity[2]).toBe(0)
  })

  it('total kinetic energy does not increase through collisions', () => {
    const R = 37.5
    const params = { ...defaultPhysicsConfig.defaultBallParams, radius: R }
    const balls = [
      new Ball([400, 500], [800, 200], R, 0, params.mass, 'a', [0, 0, 0], params, defaultPhysicsConfig),
      new Ball([800, 500], [-400, 100], R, 0, params.mass, 'b', [0, 0, 0], params, defaultPhysicsConfig),
      new Ball([600, 300], [100, 600], R, 0, params.mass, 'c', [0, 0, 0], params, defaultPhysicsConfig),
    ]

    const replay = simulate(2840, 1420, 30, balls, defaultPhysicsConfig)

    // Compute kinetic energy at each event and verify it never increases
    let prevKE = Infinity
    for (const event of replay) {
      if (event.type === EventType.CircleCollision) {
        let ke = 0
        for (const snap of event.snapshots) {
          const speed2 = snap.velocity[0] ** 2 + snap.velocity[1] ** 2
          ke += 0.5 * params.mass * speed2
        }
        // KE should not increase (with some tolerance for numerical precision)
        // Note: we only check collision events where both balls are snapshotted
        if (event.snapshots.length === 2) {
          expect(ke).toBeLessThanOrEqual(prevKE * 1.01) // 1% tolerance
          prevKE = ke
        }
      }
    }
  })

  it('balls eventually come to rest with friction', () => {
    const circles = [
      createTestBall([500, 500], [500, 300], 37.5, 0, defaultPhysicsConfig.defaultBallParams.mass, undefined),
    ]
    // Give it real physics
    circles[0].physicsParams = { ...defaultPhysicsConfig.defaultBallParams }
    circles[0].updateTrajectory(createPoolPhysicsProfile(), defaultPhysicsConfig)

    const replay = simulate(2840, 1420, 100000, circles, defaultPhysicsConfig)

    // Should have state transition events
    const stateTransitions = replay.filter((r) => r.type === EventType.StateTransition)
    expect(stateTransitions.length).toBeGreaterThan(0)

    // Last snapshot should be stationary (or close to it)
    const lastEvent = replay[replay.length - 1]
    const lastSnap = lastEvent.snapshots[0]
    const speed = Math.sqrt(lastSnap.velocity[0] ** 2 + lastSnap.velocity[1] ** 2)
    expect(speed).toBeLessThan(1) // effectively stopped
  })

  it('cushion bounce: head-on returns at approximately e * speed', () => {
    const R = 37.5
    const params = { ...defaultPhysicsConfig.defaultBallParams, radius: R }
    const speed = 1000
    // Ball heading straight into east wall
    const ball = new Ball(
      [2840 - R - 50, 710],
      [speed, 0],
      R,
      0,
      params.mass,
      'bouncer',
      [0, 0, 0],
      params,
      defaultPhysicsConfig,
    )

    const replay = simulate(2840, 1420, 10, [ball], defaultPhysicsConfig)
    const cushionHits = replay.filter((r) => r.type === EventType.CushionCollision)
    expect(cushionHits.length).toBeGreaterThanOrEqual(1)

    const snap = cushionHits[0].snapshots[0]
    // Post-collision speed should be roughly e * original speed (in the opposite direction)
    const postSpeed = Math.abs(snap.velocity[0])
    const e = params.eRestitution
    // Allow generous tolerance since Han 2005 includes angular effects
    expect(postSpeed).toBeGreaterThan(speed * e * 0.5)
    expect(postSpeed).toBeLessThan(speed * 1.1) // should not gain energy
    // Should be moving away from the wall (negative x)
    expect(snap.velocity[0]).toBeLessThan(0)
  })

  it('cushion collision does not increase total energy', () => {
    const R = 37.5
    const params = { ...defaultPhysicsConfig.defaultBallParams, radius: R }
    const ball = new Ball(
      [2840 - R - 50, 710],
      [1000, 200],
      R,
      0,
      params.mass,
      'energy-test',
      [0, 0, 0],
      params,
      defaultPhysicsConfig,
    )

    const replay = simulate(2840, 1420, 10, [ball], defaultPhysicsConfig)
    const cushionHits = replay.filter((r) => r.type === EventType.CushionCollision)
    expect(cushionHits.length).toBeGreaterThanOrEqual(1)

    // Initial KE
    const initialKE = 0.5 * params.mass * (1000 ** 2 + 200 ** 2)

    for (const hit of cushionHits) {
      const snap = hit.snapshots[0]
      const speed2 = snap.velocity[0] ** 2 + snap.velocity[1] ** 2
      const ke = 0.5 * params.mass * speed2
      // Energy should not increase (allow small numerical tolerance)
      expect(ke).toBeLessThanOrEqual(initialKE * 1.05)
    }
  })

  it('airborne ball: ball with upward velocity enters and exits airborne state', () => {
    const R = 37.5
    const params = { ...defaultPhysicsConfig.defaultBallParams, radius: R }
    // Create a ball with upward velocity (simulating post-cushion bounce)
    const ball = new Ball(
      [1000, 700],
      [500, 0, 100], // vz = 100 mm/s upward
      R,
      0,
      params.mass,
      'airborne-test',
      [0, 0, 0],
      params,
      defaultPhysicsConfig,
    )

    const profile = createPoolPhysicsProfile()
    ball.updateTrajectory(profile, defaultPhysicsConfig)

    // Ball should initially be airborne
    expect(ball.motionState).toBe(MotionState.Airborne)

    const replay = simulate(2840, 1420, 10, [ball], defaultPhysicsConfig, profile)

    // Should have state transitions (airborne → surface state)
    const transitions = replay.filter((r) => r.type === EventType.StateTransition)
    expect(transitions.length).toBeGreaterThan(0)

    // Ball should eventually settle to a non-airborne state
    const lastEvent = replay[replay.length - 1]
    const lastSnap = lastEvent.snapshots[0]
    expect(lastSnap.motionState).not.toBe(MotionState.Airborne)
  })
})
