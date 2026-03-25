import { it, expect } from 'vitest'
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

it('trace the cascade pair', { timeout: 60000 }, () => {
  const profile = createPoolPhysicsProfile()
  const circles = generateCircles(150, 2840, 1420, seededRandom(), defaultPhysicsConfig, profile)
  const replay = simulate(2840, 1420, 0.5, circles, defaultPhysicsConfig, profile)

  // Find the worst pair
  const pairCounts = new Map<string, number>()
  for (const e of replay) {
    if (e.type !== EventType.CircleCollision) continue
    const ids = e.snapshots.map((s) => s.id).sort()
    const key = ids.join('+')
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
  }

  const worst = [...pairCounts.entries()].sort(([, a], [, b]) => b - a).slice(0, 5)
  console.log('\nWorst pairs:')
  for (const [key, count] of worst) {
    console.log(`  ${key}: ${count} collisions`)
  }

  const worstPair = worst[0]?.[0]
  if (!worstPair) return

  const [idA, idB] = worstPair.split('+')

  // Trace ALL events involving either ball in the worst pair
  console.log(`\nFull event trace for worst pair (${worstPair}):`)
  let count = 0
  for (const e of replay) {
    const involvedIds = e.snapshots.map((s) => s.id)
    if (!involvedIds.includes(idA) && !involvedIds.includes(idB)) continue
    if (e.type === EventType.StateUpdate) continue
    if (count > 60) {
      console.log('  ... truncated')
      break
    }

    for (const s of e.snapshots) {
      if (s.id !== idA && s.id !== idB) continue
      const label = s.id === idA ? 'A' : 'B'
      const extra = e.type === EventType.CircleCollision ? ` (with ${e.snapshots.map((x) => x.id === idA ? 'A' : x.id === idB ? 'B' : 'other').join('+')})` : ''
      console.log(
        `  t=${e.time.toFixed(9)} ${e.type}${extra} ${label}: pos=[${s.position[0].toFixed(2)},${s.position[1].toFixed(2)}] vel=[${s.velocity[0].toFixed(1)},${s.velocity[1].toFixed(1)}] state=${s.motionState} avel=[${s.angularVelocity.map((v) => v.toFixed(1)).join(',')}]`,
      )
    }
    count++
  }

  const ballCount = replay.filter((e) => e.type === EventType.CircleCollision).length
  console.log(`\nTotal ball collisions in 0.5s: ${ballCount}`)
  expect(ballCount).toBeLessThan(10000) // should be ~few hundred
})
