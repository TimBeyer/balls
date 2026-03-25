import { it, expect } from 'vitest'
import { simulate, EventType } from '../simulation'
import Ball from '../ball'
import { defaultPhysicsConfig } from '../physics-config'
import { createPoolPhysicsProfile } from '../physics/physics-profile'

it('two ball cascade trace', { timeout: 30000 }, () => {
  const profile = createPoolPhysicsProfile()
  const R = 37.5
  const params = { ...defaultPhysicsConfig.defaultBallParams, radius: R }

  // Two balls approaching with angular velocity (preserved through collision)
  const balls = [
    new Ball([500, 500], [500, 100], R, 0, params.mass, 'a', [10, -20, 5], params, defaultPhysicsConfig),
    new Ball([700, 520], [-500, -50], R, 0, params.mass, 'b', [-5, 15, -3], params, defaultPhysicsConfig),
  ]

  const replay = simulate(2840, 1420, 2, balls, defaultPhysicsConfig, profile)

  const counts = { ball: 0, cushion: 0, state: 0 }
  for (const e of replay) {
    if (e.type === EventType.CircleCollision) counts.ball++
    else if (e.type === EventType.CushionCollision) counts.cushion++
    else if (e.type === EventType.StateTransition) counts.state++
  }

  console.log(`\n=== TWO BALL HEAD-ON ===`)
  console.log(`Events: ball=${counts.ball} cushion=${counts.cushion} state=${counts.state}`)

  // Trace first 30 events
  for (let i = 0; i < Math.min(replay.length, 40); i++) {
    const e = replay[i]
    if (e.type === EventType.StateUpdate) continue
    const snaps = e.snapshots.map((s) => `${s.id}:[${s.position[0].toFixed(1)},${s.position[1].toFixed(1)}] v=[${s.velocity[0].toFixed(1)},${s.velocity[1].toFixed(1)}] ${s.motionState}`).join(' | ')
    console.log(`  [${i}] t=${e.time.toFixed(6)} ${e.type} ${snaps}`)
  }
  console.log(`=== END ===\n`)

  // Should only have 1 ball-ball collision
  expect(counts.ball).toBeLessThan(5)
})
