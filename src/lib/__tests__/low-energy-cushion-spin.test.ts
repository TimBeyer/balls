/**
 * Reproduction tests for the low-energy cushion spin issue.
 *
 * Characterizes the Han 2005 cushion resolver behavior at various speeds and spins,
 * and tests simulation scenarios where balls interact with cushions at low energy.
 */

import { describe, it, expect } from 'vitest'
import { defaultPhysicsConfig, defaultBallParams } from '../physics-config'
import { createPoolPhysicsProfile } from '../physics/physics-profile'
import { simulate } from '../simulation'
import { getCushionEvents, getSnapshotById, createPoolBall } from './test-helpers'
import type { BallSpec } from '../scenarios'
import { Han2005CushionResolver } from '../physics/collision/han2005-cushion-resolver'
import { Cushion } from '../collision'

const TABLE_W = 2540
const TABLE_H = 1270
const R = defaultBallParams.radius // 37.5

describe('low-energy cushion spin — direct resolver characterization', () => {
  it('spin/speed ratio is constant across all speeds (no low-speed anomaly)', () => {
    const resolver = new Han2005CushionResolver()

    const results: { vx: number; omega: number; ratio: number }[] = []
    for (const vx of [1, 5, 10, 50, 200, 500, 1000]) {
      const ball = createPoolBall({ id: 'test', x: TABLE_W - R, y: TABLE_H / 2, vx, vy: 0 })
      resolver.resolve(ball, Cushion.East, TABLE_W, TABLE_H, defaultPhysicsConfig)
      const omega = Math.sqrt(
        ball.angularVelocity[0] ** 2 + ball.angularVelocity[1] ** 2 + ball.angularVelocity[2] ** 2,
      )
      results.push({ vx, omega, ratio: omega / vx })
    }

    const ratios = results.map((r) => r.ratio)
    const avgRatio = ratios.reduce((a, b) => a + b) / ratios.length
    for (const r of results) {
      expect(r.ratio).toBeCloseTo(avgRatio, 4)
    }
  })

  it('rolling ball produces 2.49x more post-collision spin (consistent across speeds)', () => {
    const resolver = new Han2005CushionResolver()

    for (const vx of [10, 50, 200]) {
      const ballNoSpin = createPoolBall({ id: 'ns', x: TABLE_W - R, y: TABLE_H / 2, vx, vy: 0 })
      resolver.resolve(ballNoSpin, Cushion.East, TABLE_W, TABLE_H, defaultPhysicsConfig)
      const omegaNoSpin = Math.sqrt(
        ballNoSpin.angularVelocity[0] ** 2 + ballNoSpin.angularVelocity[1] ** 2 + ballNoSpin.angularVelocity[2] ** 2,
      )

      const ballRolling = createPoolBall({
        id: 'r',
        x: TABLE_W - R,
        y: TABLE_H / 2,
        vx,
        vy: 0,
        spin: [0, vx / R, 0],
      })
      resolver.resolve(ballRolling, Cushion.East, TABLE_W, TABLE_H, defaultPhysicsConfig)
      const omegaRolling = Math.sqrt(
        ballRolling.angularVelocity[0] ** 2 + ballRolling.angularVelocity[1] ** 2 + ballRolling.angularVelocity[2] ** 2,
      )

      expect(omegaRolling / omegaNoSpin).toBeCloseTo(2.49, 1)
    }
  })

  it('large pre-existing spin barely changes at low approach speed', () => {
    const resolver = new Han2005CushionResolver()

    for (const [vx, wy] of [[3, 10], [3, 50], [10, 50]] as [number, number][]) {
      const ball = createPoolBall({
        id: 'test',
        x: TABLE_W - R,
        y: TABLE_H / 2,
        vx,
        vy: 0,
        spin: [0, wy, 0],
      })
      const preOmega = Math.sqrt(
        ball.angularVelocity[0] ** 2 + ball.angularVelocity[1] ** 2 + ball.angularVelocity[2] ** 2,
      )
      resolver.resolve(ball, Cushion.East, TABLE_W, TABLE_H, defaultPhysicsConfig)
      const postOmega = Math.sqrt(
        ball.angularVelocity[0] ** 2 + ball.angularVelocity[1] ** 2 + ball.angularVelocity[2] ** 2,
      )
      expect(Math.abs((postOmega - preOmega) / preOmega)).toBeLessThan(0.05)
    }
  })

  it('z-spin lateral throw is proportional to approach speed, not spin magnitude', () => {
    const resolver = new Han2005CushionResolver()

    // At low approach speed, even large wz should produce small lateral throw
    // because the impulse magnitude is limited by approach speed
    const ball5 = createPoolBall({ id: 't', x: TABLE_W - R, y: TABLE_H / 2, vx: 5, vy: 0, spin: [0, 0, 50] })
    resolver.resolve(ball5, Cushion.East, TABLE_W, TABLE_H, defaultPhysicsConfig)

    const ball200 = createPoolBall({ id: 't', x: TABLE_W - R, y: TABLE_H / 2, vx: 200, vy: 0, spin: [0, 0, 50] })
    resolver.resolve(ball200, Cushion.East, TABLE_W, TABLE_H, defaultPhysicsConfig)

    // vy at low speed should be much smaller than at high speed
    expect(Math.abs(ball5.velocity[1])).toBeLessThan(Math.abs(ball200.velocity[1]) * 0.1)
  })
})

describe('Han 2005 sliding regime tests', () => {
  it('low speed head-on hits no-sliding branch (Pzs ≤ Pze)', () => {
    const resolver = new Han2005CushionResolver()
    // vx=10, no spin: small sliding velocity → Pzs small → no-sliding branch
    const ball = createPoolBall({ id: 'test', x: TABLE_W - R, y: TABLE_H / 2, vx: 10, vy: 0 })
    resolver.resolve(ball, Cushion.East, TABLE_W, TABLE_H, defaultPhysicsConfig)

    // Should bounce back
    expect(ball.velocity[0]).toBeLessThan(0)
    // No-sliding: energy loss comes only from restitution
    const e = defaultBallParams.eRestitution
    // Post-speed should be close to e * pre-speed (for head-on, vPerp dominates)
    expect(Math.abs(ball.velocity[0])).toBeGreaterThan(10 * e * 0.5)
  })

  it('high speed with large spin hits full-sliding branch', () => {
    const resolver = new Han2005CushionResolver()
    // vx=2000 with large wy (rolling spin) creates large sx → Pzs > Pze → full-sliding
    const ball = createPoolBall({
      id: 'test',
      x: TABLE_W - R,
      y: TABLE_H / 2,
      vx: 2000,
      vy: 0,
      spin: [0, 2000 / R, 100],
    })
    resolver.resolve(ball, Cushion.East, TABLE_W, TABLE_H, defaultPhysicsConfig)

    // Should bounce back
    expect(ball.velocity[0]).toBeLessThan(0)
    // Full-sliding has more friction energy loss than no-sliding
  })

  it('full-sliding case loses more energy than no-sliding case', () => {
    const resolver = new Han2005CushionResolver()
    const mass = defaultBallParams.mass

    // No-sliding: low speed, no spin
    const noSlide = createPoolBall({ id: 'ns', x: TABLE_W - R, y: TABLE_H / 2, vx: 50, vy: 0 })
    const preKE_ns = 0.5 * mass * 50 * 50
    resolver.resolve(noSlide, Cushion.East, TABLE_W, TABLE_H, defaultPhysicsConfig)
    const postSpeed_ns = Math.sqrt(noSlide.velocity[0] ** 2 + noSlide.velocity[1] ** 2)
    const postKE_ns = 0.5 * mass * postSpeed_ns * postSpeed_ns
    const lossRatio_ns = 1 - postKE_ns / preKE_ns

    // Full-sliding: high speed with rolling spin (large sx)
    const fullSlide = createPoolBall({
      id: 'fs',
      x: TABLE_W - R,
      y: TABLE_H / 2,
      vx: 2000,
      vy: 0,
      spin: [0, 2000 / R, 0],
    })
    const preKE_fs = 0.5 * mass * 2000 * 2000
    resolver.resolve(fullSlide, Cushion.East, TABLE_W, TABLE_H, defaultPhysicsConfig)
    const postSpeed_fs = Math.sqrt(fullSlide.velocity[0] ** 2 + fullSlide.velocity[1] ** 2)
    const postKE_fs = 0.5 * mass * postSpeed_fs * postSpeed_fs
    const lossRatio_fs = 1 - postKE_fs / preKE_fs

    // Full-sliding should lose a larger fraction of translational KE
    expect(lossRatio_fs).toBeGreaterThan(lossRatio_ns)
  })
})

describe('trajectory clamping after cushion hit', () => {
  it('ball does not drift back into wall after cushion bounce', () => {
    // After a cushion hit, the ball's trajectory must not carry it back into the wall
    // within the first small dt. This tests that trajectory acceleration is correctly
    // oriented away from the wall.
    const resolver = new Han2005CushionResolver()
    const profile = createPoolPhysicsProfile()

    for (const cushion of [Cushion.East, Cushion.West, Cushion.North, Cushion.South]) {
      const spec: BallSpec = (() => {
        switch (cushion) {
          case Cushion.East:
            return { id: 'b', x: TABLE_W - R, y: TABLE_H / 2, vx: 500, vy: 0 }
          case Cushion.West:
            return { id: 'b', x: R, y: TABLE_H / 2, vx: -500, vy: 0 }
          case Cushion.North:
            return { id: 'b', x: TABLE_W / 2, y: TABLE_H - R, vx: 0, vy: 500 }
          case Cushion.South:
            return { id: 'b', x: TABLE_W / 2, y: R, vx: 0, vy: -500 }
        }
      })()

      const ball = createPoolBall(spec)
      resolver.resolve(ball, cushion, TABLE_W, TABLE_H, defaultPhysicsConfig)
      ball.updateTrajectory(profile, defaultPhysicsConfig)

      // Check position at small dt (1ms) — should not be past the wall
      const dt = 0.001
      const pos = ball.position3DAtTime(ball.time + dt)
      switch (cushion) {
        case Cushion.East:
          expect(pos[0]).toBeLessThanOrEqual(TABLE_W - R + 0.1)
          break
        case Cushion.West:
          expect(pos[0]).toBeGreaterThanOrEqual(R - 0.1)
          break
        case Cushion.North:
          expect(pos[1]).toBeLessThanOrEqual(TABLE_H - R + 0.1)
          break
        case Cushion.South:
          expect(pos[1]).toBeGreaterThanOrEqual(R - 0.1)
          break
      }
    }
  })
})

describe('low-energy cushion spin — simulation scenarios', () => {
  it('ball nudged into east wall by another ball', () => {
    // Simulate a ball near the east wall being hit softly from behind.
    // The cue ball sends the target into the cushion at low speed.
    const specs: BallSpec[] = [
      { id: 'cue', x: TABLE_W - R - 200, y: TABLE_H / 2, vx: 150, vy: 0 },
      { id: 'target', x: TABLE_W - R - 80, y: TABLE_H / 2, vx: 0, vy: 0 },
    ]

    const balls = specs.map((s) => createPoolBall(s))
    const profile = createPoolPhysicsProfile()
    const replay = simulate(TABLE_W, TABLE_H, 10, balls, defaultPhysicsConfig, profile)

    const cushionHits = getCushionEvents(replay)
    const targetCushionHits = cushionHits.filter((e) => getSnapshotById(e, 'target'))

    console.log(`\n--- Ball nudged into wall: ${targetCushionHits.length} target cushion hits ---`)
    for (let i = 0; i < targetCushionHits.length; i++) {
      const snap = getSnapshotById(targetCushionHits[i], 'target')!
      const speed = Math.sqrt(snap.velocity[0] ** 2 + snap.velocity[1] ** 2)
      const omega = Math.sqrt(
        snap.angularVelocity[0] ** 2 + snap.angularVelocity[1] ** 2 + snap.angularVelocity[2] ** 2,
      )
      console.log(
        `  hit ${i + 1} t=${targetCushionHits[i].time.toFixed(4)}: speed=${speed.toFixed(2)}, |ω|=${omega.toFixed(4)}, ` +
        `v=(${snap.velocity[0].toFixed(2)}, ${snap.velocity[1].toFixed(2)}), ` +
        `ω=(${snap.angularVelocity[0].toFixed(3)}, ${snap.angularVelocity[1].toFixed(3)}, ${snap.angularVelocity[2].toFixed(3)})`,
      )
    }
  })

  it('ball with sidespin near east wall', () => {
    const spec: BallSpec = {
      id: 'sidespin',
      x: TABLE_W - R - 10,
      y: TABLE_H / 2,
      vx: 100,
      vy: 0,
      spin: [0, 0, 20],
    }

    const ball = createPoolBall(spec)
    const profile = createPoolPhysicsProfile()
    const replay = simulate(TABLE_W, TABLE_H, 15, [ball], defaultPhysicsConfig, profile)
    const cushionHits = getCushionEvents(replay)

    expect(cushionHits.length).toBeGreaterThan(0)

    console.log(`\n--- Sidespin ball: ${cushionHits.length} cushion hits ---`)
    for (let i = 0; i < Math.min(cushionHits.length, 10); i++) {
      const snap = getSnapshotById(cushionHits[i], 'sidespin')!
      const speed = Math.sqrt(snap.velocity[0] ** 2 + snap.velocity[1] ** 2)
      const omega = Math.sqrt(
        snap.angularVelocity[0] ** 2 + snap.angularVelocity[1] ** 2 + snap.angularVelocity[2] ** 2,
      )
      console.log(
        `  bounce ${i + 1} t=${cushionHits[i].time.toFixed(4)}: speed=${speed.toFixed(2)}, ` +
        `|ω|=${omega.toFixed(4)}, state=${snap.motionState}`,
      )
    }
  })

  it('ball approaching wall — track full event sequence including state transitions', () => {
    // Show the complete event timeline: sliding→rolling→cushion→...
    // to understand how spin accumulates before the cushion hit
    const spec: BallSpec = {
      id: 'tracker',
      x: TABLE_W - R - 50,
      y: TABLE_H / 2,
      vx: 200,
      vy: 0,
    }

    const ball = createPoolBall(spec)
    const profile = createPoolPhysicsProfile()
    const replay = simulate(TABLE_W, TABLE_H, 5, [ball], defaultPhysicsConfig, profile)

    console.log(`\n--- Full event timeline (${replay.length} events) ---`)
    for (let i = 0; i < replay.length; i++) {
      const event = replay[i]
      const snap = getSnapshotById(event, 'tracker') ?? event.snapshots[0]
      if (!snap) continue
      const speed = Math.sqrt(snap.velocity[0] ** 2 + snap.velocity[1] ** 2)
      const omega = Math.sqrt(
        snap.angularVelocity[0] ** 2 + snap.angularVelocity[1] ** 2 + snap.angularVelocity[2] ** 2,
      )
      console.log(
        `  ${event.type.padEnd(20)} t=${event.time.toFixed(6)}: speed=${speed.toFixed(2)}, ` +
        `|ω|=${omega.toFixed(4)}, state=${snap.motionState}, ` +
        `v=(${snap.velocity[0].toFixed(2)}, ${snap.velocity[1].toFixed(2)}), ` +
        `ω=(${snap.angularVelocity[0].toFixed(3)}, ${snap.angularVelocity[1].toFixed(3)}, ${snap.angularVelocity[2].toFixed(3)})`,
      )
    }
  })

  it('cluster scenario: ball pushed gently into cushion by cluster resolution', () => {
    // Three balls near the east wall. Middle ball gets hit from behind.
    // Inner ball should be pushed into cushion at very low speed.
    const specs: BallSpec[] = [
      { id: 'cue', x: TABLE_W - R * 2 - 200, y: TABLE_H / 2, vx: 300, vy: 0 },
      { id: 'middle', x: TABLE_W - R * 2 - 80, y: TABLE_H / 2, vx: 0, vy: 0 },
      { id: 'wall', x: TABLE_W - R - 1, y: TABLE_H / 2, vx: 0, vy: 0 }, // almost touching wall
    ]

    const balls = specs.map((s) => createPoolBall(s))
    const profile = createPoolPhysicsProfile()
    const replay = simulate(TABLE_W, TABLE_H, 10, balls, defaultPhysicsConfig, profile)

    const cushionHits = getCushionEvents(replay)
    const wallBallHits = cushionHits.filter((e) => getSnapshotById(e, 'wall'))

    console.log(`\n--- Ball near wall hit by cluster: ${wallBallHits.length} cushion hits ---`)
    for (let i = 0; i < Math.min(wallBallHits.length, 5); i++) {
      const snap = getSnapshotById(wallBallHits[i], 'wall')!
      const speed = Math.sqrt(snap.velocity[0] ** 2 + snap.velocity[1] ** 2)
      const omega = Math.sqrt(
        snap.angularVelocity[0] ** 2 + snap.angularVelocity[1] ** 2 + snap.angularVelocity[2] ** 2,
      )
      console.log(
        `  hit ${i + 1} t=${wallBallHits[i].time.toFixed(4)}: speed=${speed.toFixed(2)}, |ω|=${omega.toFixed(4)}, ` +
        `v=(${snap.velocity[0].toFixed(2)}, ${snap.velocity[1].toFixed(2)}), ` +
        `ω=(${snap.angularVelocity[0].toFixed(3)}, ${snap.angularVelocity[1].toFixed(3)}, ${snap.angularVelocity[2].toFixed(3)})`,
      )
    }

    // Also show all events for the wall ball
    console.log('\n--- Wall ball full timeline ---')
    for (const event of replay) {
      const snap = getSnapshotById(event, 'wall')
      if (!snap) continue
      const speed = Math.sqrt(snap.velocity[0] ** 2 + snap.velocity[1] ** 2)
      const omega = Math.sqrt(
        snap.angularVelocity[0] ** 2 + snap.angularVelocity[1] ** 2 + snap.angularVelocity[2] ** 2,
      )
      console.log(
        `  ${event.type.padEnd(20)} t=${event.time.toFixed(6)}: speed=${speed.toFixed(2)}, |ω|=${omega.toFixed(4)}, ` +
        `state=${snap.motionState}`,
      )
    }
  })
})
