import { it } from 'vitest'
import { simulate, EventType } from '../simulation'
import { generateCircles } from '../generate-circles'
import { defaultPhysicsConfig } from '../physics-config'
import { createPoolPhysicsProfile } from '../physics/physics-profile'
import { zeroFrictionConfig } from './test-helpers'

function seededRandom() {
  let s = 42
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

it('phantom check — zero friction (no contact filter)', { timeout: 30000 }, () => {
  // Temporarily measure gap at collision time WITHOUT the contact verification filter
  const circles = generateCircles(150, 2840, 1420, seededRandom(), zeroFrictionConfig)
  const replay = simulate(2840, 1420, 5, circles, zeroFrictionConfig)
  let maxGap = 0
  const gapBuckets = { sub001: 0, sub01: 0, sub05: 0, sub1: 0, over1: 0 }
  for (const e of replay) {
    if (e.type !== EventType.CircleCollision) continue
    const s0 = e.snapshots[0]
    const s1 = e.snapshots[1]
    const dx = s0.position[0] - s1.position[0]
    const dy = s0.position[1] - s1.position[1]
    const dist = Math.sqrt(dx * dx + dy * dy)
    const gap = dist - s0.radius - s1.radius
    if (gap > 0) {
      maxGap = Math.max(maxGap, gap)
      if (gap < 0.001) gapBuckets.sub001++
      else if (gap < 0.01) gapBuckets.sub01++
      else if (gap < 0.05) gapBuckets.sub05++
      else if (gap < 1) gapBuckets.sub1++
      else gapBuckets.over1++
    }
  }
  const total = replay.filter((e) => e.type === EventType.CircleCollision).length
  console.log(`Zero friction 5s: ${total} collisions, maxGap=${maxGap.toExponential(2)}mm`)
  console.log(`  Gaps: <0.001mm=${gapBuckets.sub001} <0.01mm=${gapBuckets.sub01} <0.05mm=${gapBuckets.sub05} <1mm=${gapBuckets.sub1} >=1mm=${gapBuckets.over1}`)
})

it('phantom check — pool physics (no contact filter)', { timeout: 30000 }, () => {
  const profile = createPoolPhysicsProfile()
  const circles = generateCircles(150, 2840, 1420, seededRandom(), defaultPhysicsConfig, profile)
  const replay = simulate(2840, 1420, 5, circles, defaultPhysicsConfig, profile)
  let maxGap = 0
  const gapBuckets = { sub001: 0, sub01: 0, sub05: 0, sub1: 0, over1: 0 }
  for (const e of replay) {
    if (e.type !== EventType.CircleCollision) continue
    const s0 = e.snapshots[0]
    const s1 = e.snapshots[1]
    const dx = s0.position[0] - s1.position[0]
    const dy = s0.position[1] - s1.position[1]
    const dist = Math.sqrt(dx * dx + dy * dy)
    const gap = dist - s0.radius - s1.radius
    if (gap > 0) {
      maxGap = Math.max(maxGap, gap)
      if (gap < 0.001) gapBuckets.sub001++
      else if (gap < 0.01) gapBuckets.sub01++
      else if (gap < 0.05) gapBuckets.sub05++
      else if (gap < 1) gapBuckets.sub1++
      else gapBuckets.over1++
    }
  }
  const total = replay.filter((e) => e.type === EventType.CircleCollision).length
  console.log(`Pool physics 5s: ${total} collisions, maxGap=${maxGap.toExponential(2)}mm`)
  console.log(`  Gaps: <0.001mm=${gapBuckets.sub001} <0.01mm=${gapBuckets.sub01} <0.05mm=${gapBuckets.sub05} <1mm=${gapBuckets.sub1} >=1mm=${gapBuckets.over1}`)
})
