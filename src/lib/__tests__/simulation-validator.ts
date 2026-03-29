/**
 * Simulation Validator — automated physics invariant checking for replays.
 *
 * Unlike the assertion helpers in test-helpers.ts (which throw on first failure),
 * this collects ALL violations for comprehensive diagnostics.
 */

import { ReplayData, EventType, CircleSnapshot } from '../simulation'
import { MotionState } from '../motion-state'

export interface Violation {
  type: string
  time: number
  ballId?: string
  message: string
  severity: 'error' | 'warning'
}

export interface ValidationResult {
  valid: boolean
  violations: Violation[]
}

function speed(snap: CircleSnapshot): number {
  return Math.sqrt(snap.velocity[0] ** 2 + snap.velocity[1] ** 2)
}

function distance(a: CircleSnapshot, b: CircleSnapshot): number {
  const dx = a.position[0] - b.position[0]
  const dy = a.position[1] - b.position[1]
  return Math.sqrt(dx * dx + dy * dy)
}

function totalKE(snapshots: CircleSnapshot[], mass: number): number {
  let ke = 0
  for (const s of snapshots) {
    ke += 0.5 * mass * (s.velocity[0] ** 2 + s.velocity[1] ** 2)
  }
  return ke
}

// ─── Individual checks ────────────────────────────────────────────────────────

function checkNoNaN(replay: ReplayData[]): Violation[] {
  const violations: Violation[] = []
  for (const event of replay) {
    for (const snap of event.snapshots) {
      const vals = [
        snap.position[0],
        snap.position[1],
        snap.velocity[0],
        snap.velocity[1],
        snap.angularVelocity[0],
        snap.angularVelocity[1],
        snap.angularVelocity[2],
      ]
      for (const v of vals) {
        if (!Number.isFinite(v)) {
          violations.push({
            type: 'NaN/Infinity',
            time: event.time,
            ballId: snap.id,
            message: `Ball ${snap.id.slice(0, 8)} has NaN/Infinity in state at t=${event.time.toFixed(6)}`,
            severity: 'error',
          })
          break
        }
      }
    }
  }
  return violations
}

function checkSpeedSanity(replay: ReplayData[]): Violation[] {
  if (replay.length === 0) return []
  const violations: Violation[] = []

  // Compute max initial speed from first event
  let maxInitialSpeed = 0
  for (const snap of replay[0].snapshots) {
    maxInitialSpeed = Math.max(maxInitialSpeed, speed(snap))
  }
  // Allow 2x initial speed as absolute maximum (collisions can concentrate energy but not create it)
  const limit = Math.max(maxInitialSpeed * 2, 100)

  for (const event of replay) {
    for (const snap of event.snapshots) {
      const s = speed(snap)
      if (s > limit) {
        violations.push({
          type: 'SpeedSanity',
          time: event.time,
          ballId: snap.id,
          message: `Ball ${snap.id.slice(0, 8)} speed=${s.toFixed(1)} exceeds limit=${limit.toFixed(1)} at t=${event.time.toFixed(6)}`,
          severity: 'error',
        })
      }
    }
  }
  return violations
}

function checkNoSpontaneousEnergy(replay: ReplayData[]): Violation[] {
  const violations: Violation[] = []
  // Track last known speed for each ball
  const lastSpeed = new Map<string, { speed: number; time: number }>()

  // Initialize from first event
  if (replay.length > 0) {
    for (const snap of replay[0].snapshots) {
      lastSpeed.set(snap.id, { speed: speed(snap), time: replay[0].time })
    }
  }

  for (let i = 1; i < replay.length; i++) {
    const event = replay[i]
    // Determine which balls are directly involved in this event
    const involvedBalls = new Set<string>()
    if (event.type === EventType.CircleCollision) {
      // In a circle collision, typically only 2 balls are directly involved
      // but snapshots contain all balls. The involved balls are those whose
      // velocity actually changed.
      // Heuristic: balls whose speed changed significantly are involved
      for (const snap of event.snapshots) {
        const prev = lastSpeed.get(snap.id)
        if (prev) {
          const s = speed(snap)
          const delta = Math.abs(s - prev.speed)
          if (delta > 0.1) involvedBalls.add(snap.id)
        }
      }
    } else if (event.type === EventType.CushionCollision) {
      for (const snap of event.snapshots) {
        const prev = lastSpeed.get(snap.id)
        if (prev) {
          const s = speed(snap)
          const delta = Math.abs(s - prev.speed)
          if (delta > 0.1) involvedBalls.add(snap.id)
        }
      }
    } else if (event.type === EventType.StateTransition) {
      // State transitions can change velocity (e.g., sliding friction)
      for (const snap of event.snapshots) {
        involvedBalls.add(snap.id)
      }
    }

    // Check for uninvolved balls gaining speed
    for (const snap of event.snapshots) {
      const s = speed(snap)
      const prev = lastSpeed.get(snap.id)

      if (prev && !involvedBalls.has(snap.id)) {
        const gained = s - prev.speed
        // Allow small floating-point noise (0.1 mm/s)
        if (gained > 0.1) {
          violations.push({
            type: 'SpontaneousEnergy',
            time: event.time,
            ballId: snap.id,
            message: `Ball ${snap.id.slice(0, 8)} gained ${gained.toFixed(2)} mm/s without collision (${prev.speed.toFixed(1)} → ${s.toFixed(1)}) at t=${event.time.toFixed(6)}`,
            severity: 'error',
          })
        }
      }

      lastSpeed.set(snap.id, { speed: s, time: event.time })
    }
  }
  return violations
}

function checkNoOverlaps(replay: ReplayData[], tolerance = 0.5): Violation[] {
  const violations: Violation[] = []
  const collisions = replay.filter((e) => e.type === EventType.CircleCollision)
  for (const event of collisions) {
    const snaps = event.snapshots
    for (let i = 0; i < snaps.length; i++) {
      for (let j = i + 1; j < snaps.length; j++) {
        const dist = distance(snaps[i], snaps[j])
        const rSum = snaps[i].radius + snaps[j].radius
        const gap = dist - rSum
        if (gap < -tolerance) {
          violations.push({
            type: 'Overlap',
            time: event.time,
            ballId: `${snaps[i].id.slice(0, 8)}+${snaps[j].id.slice(0, 8)}`,
            message: `Overlap of ${(-gap).toFixed(4)}mm between ${snaps[i].id.slice(0, 8)} and ${snaps[j].id.slice(0, 8)} at t=${event.time.toFixed(6)}`,
            severity: 'error',
          })
        }
      }
    }
  }
  return violations
}

function checkInBounds(replay: ReplayData[], tableWidth: number, tableHeight: number): Violation[] {
  const violations: Violation[] = []
  for (const event of replay) {
    for (const snap of event.snapshots) {
      if (snap.motionState === MotionState.Airborne) continue
      const R = snap.radius
      const margin = 1 // 1mm tolerance
      if (
        snap.position[0] < R - margin ||
        snap.position[0] > tableWidth - R + margin ||
        snap.position[1] < R - margin ||
        snap.position[1] > tableHeight - R + margin
      ) {
        violations.push({
          type: 'OutOfBounds',
          time: event.time,
          ballId: snap.id,
          message: `Ball ${snap.id.slice(0, 8)} out of bounds at (${snap.position[0].toFixed(1)}, ${snap.position[1].toFixed(1)}) t=${event.time.toFixed(6)}`,
          severity: 'error',
        })
      }
    }
  }
  return violations
}

function checkMonotonicTime(replay: ReplayData[]): Violation[] {
  const violations: Violation[] = []
  for (let i = 1; i < replay.length; i++) {
    if (replay[i].time < replay[i - 1].time) {
      violations.push({
        type: 'TimeRegression',
        time: replay[i].time,
        message: `Time went backwards: ${replay[i - 1].time.toFixed(6)} → ${replay[i].time.toFixed(6)} at event ${i}`,
        severity: 'error',
      })
    }
  }
  return violations
}

function checkEnergyNonIncreasing(replay: ReplayData[], mass: number, tolerance = 0.01): Violation[] {
  const violations: Violation[] = []
  if (replay.length === 0) return violations

  const totalBalls = replay[0].snapshots.length
  const fullEvents = replay.filter((e) => e.snapshots.length === totalBalls)

  let prevKE: number | null = null
  for (const event of fullEvents) {
    const ke = totalKE(event.snapshots, mass)
    if (prevKE !== null && ke > 0 && prevKE > 0) {
      if (ke > prevKE * (1 + tolerance)) {
        violations.push({
          type: 'EnergyIncrease',
          time: event.time,
          message: `Total KE increased: ${prevKE.toFixed(2)} → ${ke.toFixed(2)} (${(((ke - prevKE) / prevKE) * 100).toFixed(1)}%) at t=${event.time.toFixed(6)}`,
          severity: 'error',
        })
      }
    }
    prevKE = ke
  }
  return violations
}

function checkStationaryStaysStationary(replay: ReplayData[]): Violation[] {
  const violations: Violation[] = []
  // Track balls last seen as Stationary
  const stationaryAt = new Map<string, number>() // ballId → time when last seen stationary

  for (const event of replay) {
    // Determine which balls are involved in a collision at this event
    const collidedBalls = new Set<string>()
    if (event.type === EventType.CircleCollision || event.type === EventType.CushionCollision) {
      for (const snap of event.snapshots) {
        const prev = stationaryAt.get(snap.id)
        // If this ball was stationary and now has speed, it's potentially involved
        if (prev !== undefined && speed(snap) > 1) {
          collidedBalls.add(snap.id)
        }
      }
    }

    for (const snap of event.snapshots) {
      const s = speed(snap)
      if (snap.motionState === MotionState.Stationary && s < 0.1) {
        stationaryAt.set(snap.id, event.time)
      } else if (stationaryAt.has(snap.id) && s > 1 && !collidedBalls.has(snap.id)) {
        // Ball was stationary but now has speed without being in a collision
        violations.push({
          type: 'StationaryGainedSpeed',
          time: event.time,
          ballId: snap.id,
          message: `Ball ${snap.id.slice(0, 8)} was stationary at t=${stationaryAt.get(snap.id)!.toFixed(6)} but gained speed=${s.toFixed(1)} at t=${event.time.toFixed(6)} (event=${event.type})`,
          severity: 'error',
        })
        stationaryAt.delete(snap.id)
      } else if (s >= 0.1) {
        stationaryAt.delete(snap.id)
      }
    }
  }
  return violations
}

/**
 * Check that ball trajectories don't cross wall boundaries between events.
 * For each ball, evaluates the trajectory at 5 sample points between consecutive
 * events. If any sample is out of bounds, the cushion collision event was missed.
 */
function checkTrajectoryBounds(
  replay: ReplayData[],
  tableWidth: number,
  tableHeight: number,
): Violation[] {
  const violations: Violation[] = []
  const margin = 5 // mm — generous tolerance for slight overshoots
  const SAMPLES = 5

  // Track each ball's trajectory state from its snapshots
  // At each event, we know the ball's trajectoryA, position, velocity, and time
  // We can evaluate position between events using the quadratic polynomial
  for (let i = 0; i < replay.length - 1; i++) {
    const event = replay[i]
    const nextEvent = replay[i + 1]
    const dt = nextEvent.time - event.time
    if (dt <= 0) continue

    for (const snap of event.snapshots) {
      if (snap.motionState === MotionState.Airborne) continue
      const R = snap.radius

      // Evaluate trajectory at sample points between events
      for (let s = 1; s <= SAMPLES; s++) {
        const t = (dt * s) / (SAMPLES + 1)
        const x = snap.trajectoryA[0] * t * t + snap.velocity[0] * t + snap.position[0]
        const y = snap.trajectoryA[1] * t * t + snap.velocity[1] * t + snap.position[1]

        if (x < R - margin || x > tableWidth - R + margin || y < R - margin || y > tableHeight - R + margin) {
          violations.push({
            type: 'TrajectoryOutOfBounds',
            time: event.time + t,
            ballId: snap.id,
            message:
              `Ball ${snap.id.slice(0, 8)} trajectory goes out of bounds at t=${(event.time + t).toFixed(4)}: ` +
              `pos=(${x.toFixed(1)}, ${y.toFixed(1)}), bounds=[${R}, ${(tableWidth - R).toFixed(0)}] x [${R}, ${(tableHeight - R).toFixed(0)}]`,
            severity: 'error',
          })
          break // One violation per ball per event pair is enough
        }
      }
    }
  }
  return violations
}

// ─── Main validator ───────────────────────────────────────────────────────────

export function validateSimulation(
  replay: ReplayData[],
  tableWidth: number,
  tableHeight: number,
  mass: number,
): ValidationResult {
  const violations: Violation[] = [
    ...checkNoNaN(replay),
    ...checkMonotonicTime(replay),
    ...checkSpeedSanity(replay),
    ...checkNoSpontaneousEnergy(replay),
    ...checkNoOverlaps(replay),
    ...checkInBounds(replay, tableWidth, tableHeight),
    ...checkEnergyNonIncreasing(replay, mass),
    ...checkStationaryStaysStationary(replay),
    ...checkTrajectoryBounds(replay, tableWidth, tableHeight),
  ]

  return {
    valid: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
  }
}
