import { describe, it, expect } from 'vitest'
import { simulate, EventType } from '../simulation'
import { generateCircles } from '../generate-circles'
import { defaultPhysicsConfig } from '../physics-config'
import { createPoolPhysicsProfile } from '../physics/physics-profile'

describe('perf-150', () => {
  it('150 balls for 20s (default config)', () => {
    let s = 42
    const seededRandom = () => {
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const profile = createPoolPhysicsProfile()
    const circles = generateCircles(150, 2840, 1420, seededRandom, defaultPhysicsConfig, profile)
    
    const start = performance.now()
    const replay = simulate(2840, 1420, 20, circles, defaultPhysicsConfig, profile)
    const elapsed = performance.now() - start
    
    const counts = { ball: 0, cushion: 0, state: 0, update: 0 }
    for (const e of replay) {
      if (e.type === EventType.CircleCollision) counts.ball++
      else if (e.type === EventType.CushionCollision) counts.cushion++
      else if (e.type === EventType.StateTransition) counts.state++
      else counts.update++
    }
    
    console.log(`\n=== 150 BALLS, 20s ===`)
    console.log(`Time: ${elapsed.toFixed(0)}ms`)
    console.log(`Total events: ${replay.length}`)
    console.log(`Ball-ball: ${counts.ball}, Cushion: ${counts.cushion}, State: ${counts.state}, Update: ${counts.update}`)
    console.log(`Events/sec: ${(replay.length / 20).toFixed(1)}`)
    
    // Time distribution
    const buckets: number[] = new Array(21).fill(0)
    for (const event of replay) {
      const bucket = Math.min(20, Math.floor(event.time))
      buckets[bucket]++
    }
    console.log(`\nTime distribution:`)
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i] > 0) {
        console.log(`  [${i.toString().padStart(2)}s] ${buckets[i].toString().padStart(6)}`)
      }
    }
    console.log(`=== END ===\n`)
    
    expect(elapsed).toBeLessThan(60000)
  })
})
