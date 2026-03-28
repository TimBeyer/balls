import { describe, it } from 'vitest'
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

describe('perf-quick', () => {
  for (const simTime of [1, 2, 5]) {
    it(`150 balls, pool physics, ${simTime}s`, { timeout: 60000 }, () => {
      const profile = createPoolPhysicsProfile()
      const circles = generateCircles(150, 2840, 1420, seededRandom(), defaultPhysicsConfig, profile)
      const start = performance.now()
      const replay = simulate(2840, 1420, simTime, circles, defaultPhysicsConfig, profile)
      const elapsed = performance.now() - start
      const counts = { ball: 0, cushion: 0, state: 0 }
      for (const e of replay) {
        if (e.type === EventType.CircleCollision) counts.ball++
        else if (e.type === EventType.CushionCollision) counts.cushion++
        else if (e.type === EventType.StateTransition) counts.state++
      }
      console.log(`${simTime}s: ${elapsed.toFixed(0)}ms, ${replay.length} events (ball=${counts.ball} cushion=${counts.cushion} state=${counts.state})`)
    })
  }
})
