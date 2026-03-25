import { it } from 'vitest'
import { simulate, EventType } from '../simulation'
import { generateCircles } from '../generate-circles'
import { defaultPhysicsConfig } from '../physics-config'
import { createPoolPhysicsProfile } from '../physics/physics-profile'

function seededRandom() {
  let s = 42
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

it('cascade analysis', { timeout: 60000 }, () => {
  const profile = createPoolPhysicsProfile()
  const circles = generateCircles(150, 2840, 1420, seededRandom(), defaultPhysicsConfig, profile)
  const replay = simulate(2840, 1420, 1, circles, defaultPhysicsConfig, profile)

  // Track consecutive collisions for same pair
  const pairLastTime = new Map<string, { time: number; count: number }>()
  let cascadeCollisions = 0
  let normalCollisions = 0

  for (const e of replay) {
    if (e.type !== EventType.CircleCollision) continue
    const ids = e.snapshots.map((s) => s.id).sort()
    const key = ids.join('+')
    const last = pairLastTime.get(key)
    const gap = last ? e.time - last.time : Infinity

    if (gap < 0.001) {
      // Same pair colliding within 1ms — likely cascade
      cascadeCollisions++
      last!.count++
      last!.time = e.time
    } else {
      normalCollisions++
      pairLastTime.set(key, { time: e.time, count: 1 })
    }
  }

  // Find worst offenders
  const worst = [...pairLastTime.entries()]
    .filter(([, v]) => v.count > 2)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)

  const ballCount = replay.filter((e) => e.type === EventType.CircleCollision).length
  const stateCount = replay.filter((e) => e.type === EventType.StateTransition).length

  // Time-binned event counts (100ms bins)
  const bins = new Map<number, { ball: number; state: number }>()
  for (const e of replay) {
    const bin = Math.floor(e.time * 10) // 100ms bins
    const entry = bins.get(bin) ?? { ball: 0, state: 0 }
    if (e.type === EventType.CircleCollision) entry.ball++
    else if (e.type === EventType.StateTransition) entry.state++
    bins.set(bin, entry)
  }

  console.log(`\n=== CASCADE ANALYSIS (1s, 150 balls) ===`)
  console.log(`Total events: ${replay.length} (ball=${ballCount} state=${stateCount})`)
  console.log(`Normal collisions: ${normalCollisions}`)
  console.log(`Cascade collisions (<1ms gap same pair): ${cascadeCollisions}`)
  console.log(`Cascade ratio: ${(cascadeCollisions / (normalCollisions + cascadeCollisions) * 100).toFixed(1)}%`)
  console.log(`\nWorst repeat-collision pairs:`)
  for (const [key, v] of worst) {
    console.log(`  ${key}: ${v.count} collisions`)
  }

  // Detailed trace of cascade collisions
  const pairTimeline = new Map<string, number[]>()
  for (const e of replay) {
    if (e.type !== EventType.CircleCollision) continue
    const ids = e.snapshots.map((s) => s.id).sort()
    const key = ids.join('+')
    const times = pairTimeline.get(key) ?? []
    times.push(e.time)
    pairTimeline.set(key, times)
  }
  const worstPairs = [...pairTimeline.entries()]
    .filter(([, times]) => times.length > 3)
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 3)
  // Find the worst pair and trace its velocity at each collision
  const worstKey = worstPairs[0]?.[0]
  if (worstKey) {
    console.log(`\nVelocity trace for worst pair (${worstKey}):`)
    let count = 0
    for (const e of replay) {
      if (e.type !== EventType.CircleCollision) continue
      const ids = e.snapshots.map((s) => s.id).sort()
      if (ids.join('+') !== worstKey) continue
      if (count < 10 || (count % 50 === 0) || count === 378) {
        const s0 = e.snapshots[0]
        const s1 = e.snapshots[1]
        const dx = s1.position[0] - s0.position[0]
        const dy = s1.position[1] - s0.position[1]
        const dist = Math.sqrt(dx * dx + dy * dy)
        console.log(`  [${count}] t=${e.time.toFixed(6)} dist=${dist.toFixed(2)} gap=${(dist - s0.radius - s1.radius).toFixed(4)}`)
        console.log(`    A: pos=[${s0.position[0].toFixed(1)},${s0.position[1].toFixed(1)}] vel=[${s0.velocity[0].toFixed(1)},${s0.velocity[1].toFixed(1)}] state=${s0.motionState} avel=[${s0.angularVelocity.map(v => v.toFixed(1)).join(',')}]`)
        console.log(`    B: pos=[${s1.position[0].toFixed(1)},${s1.position[1].toFixed(1)}] vel=[${s1.velocity[0].toFixed(1)},${s1.velocity[1].toFixed(1)}] state=${s1.motionState} avel=[${s1.angularVelocity.map(v => v.toFixed(1)).join(',')}]`)
      }
      count++
    }
  }

  console.log(`\nDetailed cascade traces:`)
  for (const [key, times] of worstPairs) {
    console.log(`  ${key} (${times.length} hits):`)
    for (let i = 0; i < Math.min(times.length, 15); i++) {
      const gap = i > 0 ? `  gap=${(times[i] - times[i-1]).toExponential(2)}s` : ''
      console.log(`    t=${times[i].toFixed(9)}${gap}`)
    }
    if (times.length > 15) console.log(`    ... and ${times.length - 15} more`)
  }

  // Time distribution of ball collisions
  const ballEvents = replay.filter((e) => e.type === EventType.CircleCollision)
  const gaps: number[] = []
  for (let i = 1; i < ballEvents.length; i++) {
    gaps.push(ballEvents[i].time - ballEvents[i - 1].time)
  }
  gaps.sort((a, b) => a - b)
  if (gaps.length > 0) {
    console.log(`\nInter-collision time gaps:`)
    console.log(`  Min: ${gaps[0].toExponential(2)}s`)
    console.log(`  P25: ${gaps[Math.floor(gaps.length * 0.25)].toExponential(2)}s`)
    console.log(`  P50: ${gaps[Math.floor(gaps.length * 0.5)].toExponential(2)}s`)
    console.log(`  P75: ${gaps[Math.floor(gaps.length * 0.75)].toExponential(2)}s`)
    console.log(`  Max: ${gaps[gaps.length - 1].toExponential(2)}s`)
    console.log(`  Sub-microsecond gaps: ${gaps.filter((g) => g < 1e-6).length}`)
    console.log(`  Sub-nanosecond gaps: ${gaps.filter((g) => g < 1e-9).length}`)
  }
  console.log(`\nTime-binned events (100ms):`)
  for (const [bin, counts] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  [${(bin / 10).toFixed(1)}s] ball=${counts.ball} state=${counts.state}`)
  }
  console.log(`=== END ===\n`)
})
