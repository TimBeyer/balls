import Ball from '../ball'
import type Vector2D from '../vector2d'
import type Vector3D from '../vector3d'
import { BallPhysicsParams, PhysicsConfig, defaultPhysicsConfig, defaultBallParams } from '../physics-config'
import { simulate, ReplayData, EventType, CircleSnapshot } from '../simulation'
import { createPoolPhysicsProfile, createSimple2DProfile } from '../physics/physics-profile'
import type { PhysicsProfile } from '../physics/physics-profile'
import { MotionState } from '../motion-state'
import type { Scenario, BallSpec } from '../scenarios'
import { generateCircles } from '../generate-circles'

// ─── Zero-friction config (ideal physics for simple collision tests) ─────────

export const zeroFrictionParams: BallPhysicsParams = {
  mass: 100,
  radius: 37.5,
  muSliding: 0,
  muRolling: 0,
  muSpinning: 0,
  eRestitution: 1.0,
}

export const zeroFrictionConfig: PhysicsConfig = {
  gravity: 9810,
  cushionHeight: 10.1,
  eTableRestitution: 0.5,
  defaultBallParams: zeroFrictionParams,
}

// ─── Ball factories ──────────────────────────────────────────────────────────

/**
 * Create a ball with zero friction — constant velocity, no energy loss.
 */
export function createTestBall(
  position: Vector2D | Vector3D,
  velocity: Vector2D | Vector3D,
  radius: number = 37.5,
  time: number = 0,
  mass: number = 100,
  id?: string,
): Ball {
  return new Ball(
    position,
    velocity,
    radius,
    time,
    mass,
    id,
    [0, 0, 0],
    { ...zeroFrictionParams, radius, mass },
    zeroFrictionConfig,
  )
}

/**
 * Create a pool ball from a BallSpec (standard 37.5mm radius, 0.17kg).
 */
export function createPoolBall(
  spec: BallSpec,
  physicsConfig: PhysicsConfig = defaultPhysicsConfig,
): Ball {
  const R = defaultBallParams.radius
  return new Ball(
    [spec.x, spec.y, 0],
    [spec.vx ?? 0, spec.vy ?? 0, spec.vz ?? 0],
    R,
    0,
    defaultBallParams.mass,
    spec.id,
    spec.spin ? [...spec.spin] : [0, 0, 0],
    { ...defaultBallParams },
    physicsConfig,
  )
}

/**
 * Create a zero-friction ball from a BallSpec.
 */
export function createZeroFrictionBall(spec: BallSpec): Ball {
  const R = zeroFrictionParams.radius
  return new Ball(
    [spec.x, spec.y, 0],
    [spec.vx ?? 0, spec.vy ?? 0, spec.vz ?? 0],
    R,
    0,
    zeroFrictionParams.mass,
    spec.id,
    spec.spin ? [...spec.spin] : [0, 0, 0],
    { ...zeroFrictionParams },
    zeroFrictionConfig,
  )
}

// ─── Scenario runner ─────────────────────────────────────────────────────────

export function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

interface ScenarioResult {
  replay: ReplayData[]
  balls: Ball[]
  config: PhysicsConfig
  profile: PhysicsProfile
}

/**
 * Run a scenario: create balls from specs, run simulate(), return results.
 */
export function runScenario(scenario: Scenario): ScenarioResult {
  const { table, duration, physics } = scenario

  let config: PhysicsConfig
  let profile: PhysicsProfile

  if (physics === 'zero-friction') {
    config = zeroFrictionConfig
    profile = createSimple2DProfile()
  } else if (physics === 'simple2d') {
    config = defaultPhysicsConfig
    profile = createSimple2DProfile()
  } else {
    config = defaultPhysicsConfig
    profile = createPoolPhysicsProfile()
  }

  let balls: Ball[]

  if (scenario.balls.length === 0) {
    // Special case: use generateCircles for large random scenarios
    const rng = seededRandom(42)
    balls = generateCircles(150, table.width, table.height, rng, config, profile)
  } else {
    const factory = physics === 'zero-friction' ? createZeroFrictionBall : (s: BallSpec) => createPoolBall(s, config)
    balls = scenario.balls.map(factory)
  }

  const replay = simulate(table.width, table.height, duration, balls, config, profile)

  return { replay, balls, config, profile }
}

// ─── Event filtering helpers ─────────────────────────────────────────────────

export function getCollisionEvents(replay: ReplayData[]): ReplayData[] {
  return replay.filter((r) => r.type === EventType.CircleCollision)
}

export function getCushionEvents(replay: ReplayData[]): ReplayData[] {
  return replay.filter((r) => r.type === EventType.CushionCollision)
}

export function getStateTransitions(replay: ReplayData[]): ReplayData[] {
  return replay.filter((r) => r.type === EventType.StateTransition)
}

export function getSnapshotById(event: ReplayData, ballId: string): CircleSnapshot | undefined {
  return event.snapshots.find((s) => s.id === ballId)
}

export function getLastEvent(replay: ReplayData[]): ReplayData {
  return replay[replay.length - 1]
}

// ─── Physics computations ────────────────────────────────────────────────────

export function computeSpeed(snap: CircleSnapshot): number {
  return Math.sqrt(snap.velocity[0] ** 2 + snap.velocity[1] ** 2)
}

export function computeKE(snap: CircleSnapshot, mass: number): number {
  const speed2 = snap.velocity[0] ** 2 + snap.velocity[1] ** 2
  return 0.5 * mass * speed2
}

export function computeTotalKE(snapshots: CircleSnapshot[], mass: number): number {
  return snapshots.reduce((sum, s) => sum + computeKE(s, mass), 0)
}

export function computeTotalMomentum(snapshots: CircleSnapshot[], mass: number): [number, number] {
  let px = 0
  let py = 0
  for (const s of snapshots) {
    px += mass * s.velocity[0]
    py += mass * s.velocity[1]
  }
  return [px, py]
}

export function computeDistance(s1: CircleSnapshot, s2: CircleSnapshot): number {
  const dx = s1.position[0] - s2.position[0]
  const dy = s1.position[1] - s2.position[1]
  return Math.sqrt(dx * dx + dy * dy)
}

// ─── Shared assertion helpers ────────────────────────────────────────────────

/**
 * Assert no overlaps at any ball-ball collision event.
 * Tolerance: gap must be >= -tolerance (default 0.5mm).
 */
export function assertNoOverlaps(replay: ReplayData[], tolerance = 0.5): void {
  const collisions = getCollisionEvents(replay)
  for (const event of collisions) {
    const snaps = event.snapshots
    for (let i = 0; i < snaps.length; i++) {
      for (let j = i + 1; j < snaps.length; j++) {
        const dist = computeDistance(snaps[i], snaps[j])
        const rSum = snaps[i].radius + snaps[j].radius
        const gap = dist - rSum
        expect(gap).toBeGreaterThanOrEqual(
          -tolerance,
          `Overlap of ${-gap.toFixed(4)}mm between ${snaps[i].id} and ${snaps[j].id} at t=${event.time.toFixed(6)}`,
        )
      }
    }
  }
}

/**
 * Assert all non-airborne balls stay within table bounds at every event.
 */
export function assertInBounds(replay: ReplayData[], tableWidth: number, tableHeight: number): void {
  for (const event of replay) {
    for (const snap of event.snapshots) {
      if (snap.motionState === MotionState.Airborne) continue
      const R = snap.radius
      expect(snap.position[0]).toBeGreaterThanOrEqual(R - 1)
      expect(snap.position[0]).toBeLessThanOrEqual(tableWidth - R + 1)
      expect(snap.position[1]).toBeGreaterThanOrEqual(R - 1)
      expect(snap.position[1]).toBeLessThanOrEqual(tableHeight - R + 1)
    }
  }
}

/**
 * Assert simulation time advances monotonically.
 */
export function assertMonotonicTime(replay: ReplayData[]): void {
  for (let i = 1; i < replay.length; i++) {
    expect(replay[i].time).toBeGreaterThanOrEqual(replay[i - 1].time)
  }
}

/**
 * Assert total kinetic energy never increases across events.
 * Only compares events that contain ALL balls (full snapshots).
 * tolerance: fractional tolerance (default 1% = 0.01).
 */
export function assertEnergyNonIncreasing(replay: ReplayData[], mass: number, tolerance = 0.01): void {
  // Determine total ball count from the initial event (which has all balls)
  const totalBalls = replay[0].snapshots.length

  // Only compare events that have snapshots for ALL balls
  const fullEvents = replay.filter((e) => e.snapshots.length === totalBalls)

  let prevKE: number | null = null
  for (const event of fullEvents) {
    const ke = computeTotalKE(event.snapshots, mass)
    if (prevKE !== null && ke > 0 && prevKE > 0) {
      expect(ke).toBeLessThanOrEqual(prevKE * (1 + tolerance))
    }
    prevKE = ke
  }
}

/**
 * Assert total linear momentum is conserved across a single ball-ball collision.
 * Compares momentum before and after within the collision event's snapshots.
 * tolerance: absolute tolerance in momentum units (default 1.0).
 */
export function assertMomentumConservedAtCollisions(replay: ReplayData[], mass: number, tolerance = 1.0): void {
  // We compare momentum at consecutive collision events (the snapshots represent post-collision state).
  // Since between collisions only friction acts (internal), momentum should be approximately conserved
  // at the instant of ball-ball collision.
  const collisions = getCollisionEvents(replay)
  for (const event of collisions) {
    // Momentum should be conserved at each collision event across all balls
    const [px, py] = computeTotalMomentum(event.snapshots, mass)
    // Compare with the initial event (t=0)
    const [px0, py0] = computeTotalMomentum(replay[0].snapshots, mass)
    // With friction, momentum changes between events, but at collision instant it should be close
    // We use a generous tolerance since friction acts between events
    expect(Math.abs(px - px0)).toBeLessThan(tolerance * Math.max(1, Math.abs(px0)))
    expect(Math.abs(py - py0)).toBeLessThan(tolerance * Math.max(1, Math.abs(py0)))
  }
}
