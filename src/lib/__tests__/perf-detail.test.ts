import { it } from 'vitest'
import { simulate, EventType } from '../simulation'
import { generateCircles } from '../generate-circles'
import { defaultPhysicsConfig } from '../physics-config'
import { createPoolPhysicsProfile } from '../physics/physics-profile'

it('event detail', { timeout: 30000 }, () => {
  let s = 42
  const seededRandom = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const profile = createPoolPhysicsProfile()
  const circles = generateCircles(150, 2840, 1420, seededRandom, defaultPhysicsConfig, profile)
  const replay = simulate(2840, 1420, 0.1, circles, defaultPhysicsConfig, profile)
  
  // Count per-ball collision frequency
  const ballCollisions: Record<string, number> = {}
  let ballEventCount = 0
  for (const e of replay) {
    if (e.type === EventType.CircleCollision) {
      ballEventCount++
      for (const s of e.snapshots) {
        ballCollisions[s.id] = (ballCollisions[s.id] || 0) + 1
      }
    }
  }
  
  // Show top 10 most collision-heavy balls
  const sorted = Object.entries(ballCollisions).sort((a, b) => b[1] - a[1])
  console.log(`\n0.1s sim: ${replay.length} events, ${ballEventCount} ball collisions`)
  console.log(`Top collision balls:`)
  for (const [id, count] of sorted.slice(0, 10)) {
    console.log(`  ${id}: ${count} collisions`)
  }
  
  // Show first 50 events (type and time)
  console.log(`\nFirst 50 events:`)
  for (const e of replay.slice(0, 50)) {
    const ids = e.snapshots.map(s => s.id).join('+')
    console.log(`  t=${e.time.toFixed(6)} ${e.type} ${ids}`)
  }
  
  // Check for rapid re-collisions between same pair
  const pairTimes: Record<string, number[]> = {}
  for (const e of replay) {
    if (e.type === EventType.CircleCollision && e.snapshots.length === 2) {
      const ids = e.snapshots.map(s => s.id).sort().join(':')
      if (!pairTimes[ids]) pairTimes[ids] = []
      pairTimes[ids].push(e.time)
    }
  }
  
  // Find pairs that collide many times
  const frequentPairs = Object.entries(pairTimes).filter(([, times]) => times.length > 3).sort((a, b) => b[1].length - a[1].length)
  console.log(`\nPairs colliding >3 times in 0.1s:`)
  for (const [pair, times] of frequentPairs.slice(0, 10)) {
    const gaps = times.slice(1).map((t, i) => (t - times[i]).toFixed(6))
    console.log(`  ${pair}: ${times.length} collisions, gaps: ${gaps.slice(0, 5).join(', ')}`)
  }
})
