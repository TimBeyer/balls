import { describe, it, expect } from 'vitest'
import Circle from '../circle'
import { getCushionCollision, getCircleCollisionTime, Cushion } from '../collision'

describe('getCushionCollision', () => {
  const TABLE_WIDTH = 1000
  const TABLE_HEIGHT = 500

  it('detects north cushion collision', () => {
    const circle = new Circle([500, 250], [0, 1], 10, 0)
    const collision = getCushionCollision(TABLE_WIDTH, TABLE_HEIGHT, circle)
    expect(collision.cushion).toBe(Cushion.North)
    expect(collision.type).toBe('Cushion')
    expect(collision.time).toBeGreaterThan(0)
  })

  it('detects east cushion collision', () => {
    const circle = new Circle([500, 250], [1, 0], 10, 0)
    const collision = getCushionCollision(TABLE_WIDTH, TABLE_HEIGHT, circle)
    expect(collision.cushion).toBe(Cushion.East)
  })

  it('detects south cushion collision', () => {
    const circle = new Circle([500, 250], [0, -1], 10, 0)
    const collision = getCushionCollision(TABLE_WIDTH, TABLE_HEIGHT, circle)
    expect(collision.cushion).toBe(Cushion.South)
  })

  it('detects west cushion collision', () => {
    const circle = new Circle([500, 250], [-1, 0], 10, 0)
    const collision = getCushionCollision(TABLE_WIDTH, TABLE_HEIGHT, circle)
    expect(collision.cushion).toBe(Cushion.West)
  })

  it('returns the earliest cushion collision when moving diagonally', () => {
    // Moving up-right from near the east wall
    const circle = new Circle([980, 100], [1, 0.01], 10, 0)
    const collision = getCushionCollision(TABLE_WIDTH, TABLE_HEIGHT, circle)
    expect(collision.cushion).toBe(Cushion.East)
  })

  it('includes the circle in the collision data', () => {
    const circle = new Circle([500, 250], [0, 1], 10, 0)
    const collision = getCushionCollision(TABLE_WIDTH, TABLE_HEIGHT, circle)
    expect(collision.circles).toContain(circle)
    expect(collision.circles).toHaveLength(1)
  })
})

describe('getCircleCollisionTime', () => {
  it('detects collision between two circles moving toward each other', () => {
    const c1 = new Circle([100, 100], [1, 0], 10, 0)
    const c2 = new Circle([200, 100], [-1, 0], 10, 0)
    const time = getCircleCollisionTime(c1, c2)
    expect(time).toBeDefined()
    expect(time).toBeGreaterThan(0)
    // They start 100 apart (center-to-center), need to close 80 units (100 - 2*radius)
    // Closing speed is 2, so time = 80/2 = 40
    expect(time).toBeCloseTo(40, 0)
  })

  it('returns undefined when circles move apart', () => {
    const c1 = new Circle([100, 100], [-1, 0], 10, 0)
    const c2 = new Circle([200, 100], [1, 0], 10, 0)
    const time = getCircleCollisionTime(c1, c2)
    expect(time).toBeUndefined()
  })

  it('returns undefined when circles are already overlapping', () => {
    const c1 = new Circle([100, 100], [1, 0], 10, 0)
    const c2 = new Circle([110, 100], [-1, 0], 10, 0)
    const time = getCircleCollisionTime(c1, c2)
    expect(time).toBeUndefined()
  })

  it('detects collision with circles at different times', () => {
    const c1 = new Circle([100, 100], [1, 0], 10, 0)
    const c2 = new Circle([200, 100], [-1, 0], 10, 5)
    const time = getCircleCollisionTime(c1, c2)
    expect(time).toBeDefined()
    expect(time!).toBeGreaterThan(0)
  })

  it('returns undefined for parallel moving circles', () => {
    const c1 = new Circle([100, 100], [1, 0], 10, 0)
    const c2 = new Circle([100, 200], [1, 0], 10, 0)
    const time = getCircleCollisionTime(c1, c2)
    expect(time).toBeUndefined()
  })
})
