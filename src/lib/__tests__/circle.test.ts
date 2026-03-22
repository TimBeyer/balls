import { describe, it, expect } from 'vitest'
import Circle from '../circle'

describe('Circle', () => {
  it('stores position and velocity', () => {
    const circle = new Circle([100, 200], [1, 2], 10, 0)
    expect(circle.position).toEqual([100, 200])
    expect(circle.velocity).toEqual([1, 2])
    expect(circle.radius).toBe(10)
    expect(circle.x).toBe(100)
    expect(circle.y).toBe(200)
  })

  it('has default mass of 100', () => {
    const circle = new Circle([0, 0], [0, 0], 10, 0)
    expect(circle.mass).toBe(100)
  })

  it('generates a unique id', () => {
    const c1 = new Circle([0, 0], [0, 0], 10, 0)
    const c2 = new Circle([0, 0], [0, 0], 10, 0)
    expect(c1.id).toBeDefined()
    expect(c2.id).toBeDefined()
    expect(c1.id).not.toBe(c2.id)
  })

  it('accepts a custom id', () => {
    const circle = new Circle([0, 0], [0, 0], 10, 0, 100, 'custom-id')
    expect(circle.id).toBe('custom-id')
  })

  describe('positionAtTime', () => {
    it('returns current position at current time', () => {
      const circle = new Circle([100, 200], [1, 2], 10, 0)
      expect(circle.positionAtTime(0)).toEqual([100, 200])
    })

    it('projects position forward based on velocity', () => {
      const circle = new Circle([100, 200], [1, 2], 10, 0)
      expect(circle.positionAtTime(10)).toEqual([110, 220])
    })

    it('handles negative velocities', () => {
      const circle = new Circle([100, 200], [-1, -2], 10, 0)
      expect(circle.positionAtTime(10)).toEqual([90, 180])
    })

    it('accounts for circle time offset', () => {
      const circle = new Circle([100, 200], [1, 2], 10, 5)
      // At time 5, position is [100, 200]. At time 15, moved 10 units of time
      expect(circle.positionAtTime(15)).toEqual([110, 220])
    })
  })

  describe('advanceTime', () => {
    it('updates position based on velocity and time delta', () => {
      const circle = new Circle([100, 200], [1, 2], 10, 0)
      circle.advanceTime(10)
      expect(circle.position).toEqual([110, 220])
      expect(circle.time).toBe(10)
    })

    it('returns itself for chaining', () => {
      const circle = new Circle([0, 0], [1, 1], 10, 0)
      const result = circle.advanceTime(5)
      expect(result).toBe(circle)
    })

    it('handles sequential advances correctly', () => {
      const circle = new Circle([0, 0], [1, 1], 10, 0)
      circle.advanceTime(5)
      circle.advanceTime(10)
      expect(circle.position).toEqual([10, 10])
      expect(circle.time).toBe(10)
    })
  })

  describe('toString', () => {
    it('returns a formatted string representation', () => {
      const circle = new Circle([100, 200], [1, 2], 10, 0, 100, 'test-id')
      const str = circle.toString()
      expect(str).toContain('test-id')
      expect(str).toContain('100')
      expect(str).toContain('200')
    })
  })
})
