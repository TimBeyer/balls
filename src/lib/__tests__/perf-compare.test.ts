import { it } from 'vitest'
import { simulate, EventType } from '../simulation'
import { generateCircles } from '../generate-circles'
import { defaultPhysicsConfig } from '../physics-config'
import { createPoolPhysicsProfile, createSimple2DProfile } from '../physics/physics-profile'
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

it('zero friction 150 balls 1s', { timeout: 30000 }, () => {
  const circles = generateCircles(150, 2840, 1420, seededRandom(), zeroFrictionConfig)
  const start = performance.now()
  const replay = simulate(2840, 1420, 1, circles, zeroFrictionConfig)
  const elapsed = performance.now() - start
  const counts = { ball: 0, cushion: 0, state: 0 }
  for (const e of replay) {
    if (e.type === EventType.CircleCollision) counts.ball++
    else if (e.type === EventType.CushionCollision) counts.cushion++
    else if (e.type === EventType.StateTransition) counts.state++
  }
  console.log(`Zero friction 1s: ${elapsed.toFixed(0)}ms, events=${replay.length} (ball=${counts.ball} cushion=${counts.cushion} state=${counts.state})`)
})

it('simple2d 150 balls 1s', { timeout: 30000 }, () => {
  const profile = createSimple2DProfile()
  const circles = generateCircles(150, 2840, 1420, seededRandom(), defaultPhysicsConfig, profile)
  const start = performance.now()
  const replay = simulate(2840, 1420, 1, circles, defaultPhysicsConfig, profile)
  const elapsed = performance.now() - start
  const counts = { ball: 0, cushion: 0, state: 0 }
  for (const e of replay) {
    if (e.type === EventType.CircleCollision) counts.ball++
    else if (e.type === EventType.CushionCollision) counts.cushion++
    else if (e.type === EventType.StateTransition) counts.state++
  }
  console.log(`Simple2D 1s: ${elapsed.toFixed(0)}ms, events=${replay.length} (ball=${counts.ball} cushion=${counts.cushion} state=${counts.state})`)
})

it('pool physics 150 balls 1s', { timeout: 30000 }, () => {
  const profile = createPoolPhysicsProfile()
  const circles = generateCircles(150, 2840, 1420, seededRandom(), defaultPhysicsConfig, profile)
  const start = performance.now()
  const replay = simulate(2840, 1420, 1, circles, defaultPhysicsConfig, profile)
  const elapsed = performance.now() - start
  const counts = { ball: 0, cushion: 0, state: 0 }
  for (const e of replay) {
    if (e.type === EventType.CircleCollision) counts.ball++
    else if (e.type === EventType.CushionCollision) counts.cushion++
    else if (e.type === EventType.StateTransition) counts.state++
  }
  console.log(`Pool physics 1s: ${elapsed.toFixed(0)}ms, events=${replay.length} (ball=${counts.ball} cushion=${counts.cushion} state=${counts.state})`)
})
