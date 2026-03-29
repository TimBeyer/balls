import { describe, it, expect } from 'vitest'
import { createTestBall } from './test-helpers'
import { createPoolPhysicsProfile } from '../physics/physics-profile'
import { defaultPhysicsConfig } from '../physics-config'

describe('Circle (Ball)', () => {
  it('stores position and velocity', () => {
    const circle = createTestBall([100, 200], [1, 2], 10, 0)
    expect(circle.position[0]).toBe(100)
    expect(circle.position[1]).toBe(200)
    expect(circle.velocity[0]).toBe(1)
    expect(circle.velocity[1]).toBe(2)
    expect(circle.radius).toBe(10)
    expect(circle.x).toBe(100)
    expect(circle.y).toBe(200)
  })

  it('has configurable mass', () => {
    const circle = createTestBall([0, 0], [0, 0], 10, 0, 100)
    expect(circle.mass).toBe(100)
  })

  it('generates a unique id', () => {
    const c1 = createTestBall([0, 0], [0, 0], 10, 0)
    const c2 = createTestBall([0, 0], [0, 0], 10, 0)
    expect(c1.id).toBeDefined()
    expect(c2.id).toBeDefined()
    expect(c1.id).not.toBe(c2.id)
  })

  it('accepts a custom id', () => {
    const circle = createTestBall([0, 0], [0, 0], 10, 0, 100, 'custom-id')
    expect(circle.id).toBe('custom-id')
  })

  describe('positionAtTime', () => {
    it('returns current position at current time', () => {
      const circle = createTestBall([100, 200], [1, 2], 10, 0)
      expect(circle.positionAtTime(0)).toEqual([100, 200])
    })

    it('projects position forward based on velocity (zero friction)', () => {
      const circle = createTestBall([100, 200], [1, 2], 10, 0)
      const pos = circle.positionAtTime(10)
      expect(pos[0]).toBeCloseTo(110, 6)
      expect(pos[1]).toBeCloseTo(220, 6)
    })

    it('handles negative velocities', () => {
      const circle = createTestBall([100, 200], [-1, -2], 10, 0)
      const pos = circle.positionAtTime(10)
      expect(pos[0]).toBeCloseTo(90, 6)
      expect(pos[1]).toBeCloseTo(180, 6)
    })

    it('accounts for circle time offset', () => {
      const circle = createTestBall([100, 200], [1, 2], 10, 5)
      const pos = circle.positionAtTime(15)
      expect(pos[0]).toBeCloseTo(110, 6)
      expect(pos[1]).toBeCloseTo(220, 6)
    })
  })

  describe('advanceTime', () => {
    it('updates position based on velocity and time delta', () => {
      const circle = createTestBall([100, 200], [1, 2], 10, 0)
      circle.advanceTime(10)
      expect(circle.position[0]).toBeCloseTo(110, 6)
      expect(circle.position[1]).toBeCloseTo(220, 6)
      expect(circle.time).toBe(10)
    })

    it('returns itself for chaining', () => {
      const circle = createTestBall([0, 0], [1, 1], 10, 0)
      const result = circle.advanceTime(5)
      expect(result).toBe(circle)
    })

    it('handles sequential advances correctly', () => {
      const circle = createTestBall([0, 0], [1, 1], 10, 0)
      circle.advanceTime(5)
      circle.updateTrajectory(createPoolPhysicsProfile(), defaultPhysicsConfig)
      circle.advanceTime(10)
      expect(circle.position[0]).toBeCloseTo(10, 6)
      expect(circle.position[1]).toBeCloseTo(10, 6)
      expect(circle.time).toBe(10)
    })
  })

  describe('toString', () => {
    it('returns a formatted string representation', () => {
      const circle = createTestBall([100, 200], [1, 2], 10, 0, 100, 'test-id')
      const str = circle.toString()
      expect(str).toContain('test-id')
      expect(str).toContain('100')
      expect(str).toContain('200')
    })
  })
})
