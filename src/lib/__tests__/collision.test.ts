import { describe, it, expect } from 'vitest'
import { Cushion } from '../collision'
import { QuadraticCushionDetector } from '../physics/detection/cushion-detector'
import { QuarticBallBallDetector } from '../physics/detection/ball-ball-detector'
import { createTestBall } from './test-helpers'

const cushionDetector = new QuadraticCushionDetector()
const ballBallDetector = new QuarticBallBallDetector()

describe('cushion collision detection', () => {
  const TABLE_WIDTH = 1000
  const TABLE_HEIGHT = 500

  it('detects north cushion collision', () => {
    const circle = createTestBall([500, 250], [0, 1], 10, 0)
    const collision = cushionDetector.detect(circle, TABLE_WIDTH, TABLE_HEIGHT)
    expect(collision.cushion).toBe(Cushion.North)
    expect(collision.type).toBe('Cushion')
    expect(collision.time).toBeGreaterThan(0)
  })

  it('detects east cushion collision', () => {
    const circle = createTestBall([500, 250], [1, 0], 10, 0)
    const collision = cushionDetector.detect(circle, TABLE_WIDTH, TABLE_HEIGHT)
    expect(collision.cushion).toBe(Cushion.East)
  })

  it('detects south cushion collision', () => {
    const circle = createTestBall([500, 250], [0, -1], 10, 0)
    const collision = cushionDetector.detect(circle, TABLE_WIDTH, TABLE_HEIGHT)
    expect(collision.cushion).toBe(Cushion.South)
  })

  it('detects west cushion collision', () => {
    const circle = createTestBall([500, 250], [-1, 0], 10, 0)
    const collision = cushionDetector.detect(circle, TABLE_WIDTH, TABLE_HEIGHT)
    expect(collision.cushion).toBe(Cushion.West)
  })

  it('returns the earliest cushion collision when moving diagonally', () => {
    const circle = createTestBall([980, 100], [1, 0.01], 10, 0)
    const collision = cushionDetector.detect(circle, TABLE_WIDTH, TABLE_HEIGHT)
    expect(collision.cushion).toBe(Cushion.East)
  })

  it('includes the circle in the collision data', () => {
    const circle = createTestBall([500, 250], [0, 1], 10, 0)
    const collision = cushionDetector.detect(circle, TABLE_WIDTH, TABLE_HEIGHT)
    expect(collision.circles).toContain(circle)
    expect(collision.circles).toHaveLength(1)
  })
})

describe('ball-ball collision detection', () => {
  it('detects collision between two circles moving toward each other', () => {
    const c1 = createTestBall([100, 100], [1, 0], 10, 0)
    const c2 = createTestBall([200, 100], [-1, 0], 10, 0)
    const time = ballBallDetector.detect(c1, c2)
    expect(time).toBeDefined()
    expect(time).toBeGreaterThan(0)
    expect(time).toBeCloseTo(40, 0)
  })

  it('returns undefined when circles move apart', () => {
    const c1 = createTestBall([100, 100], [-1, 0], 10, 0)
    const c2 = createTestBall([200, 100], [1, 0], 10, 0)
    const time = ballBallDetector.detect(c1, c2)
    expect(time).toBeUndefined()
  })

  it('returns immediate collision when circles overlap and approach', () => {
    const c1 = createTestBall([100, 100], [1, 0], 10, 0)
    const c2 = createTestBall([110, 100], [-1, 0], 10, 0)
    const time = ballBallDetector.detect(c1, c2)
    // Overlapping (dist=10, rSum=20) and approaching → near-immediate collision
    expect(time).toBeDefined()
    expect(time).toBeLessThan(0.001)
  })

  it('returns undefined when circles overlap but separate', () => {
    const c1 = createTestBall([100, 100], [-1, 0], 10, 0)
    const c2 = createTestBall([110, 100], [1, 0], 10, 0)
    const time = ballBallDetector.detect(c1, c2)
    expect(time).toBeUndefined()
  })

  it('detects collision with circles at different times', () => {
    const c1 = createTestBall([100, 100], [1, 0], 10, 0)
    const c2 = createTestBall([200, 100], [-1, 0], 10, 5)
    const time = ballBallDetector.detect(c1, c2)
    expect(time).toBeDefined()
    expect(time!).toBeGreaterThan(0)
  })

  it('returns undefined for parallel moving circles', () => {
    const c1 = createTestBall([100, 100], [1, 0], 10, 0)
    const c2 = createTestBall([100, 200], [1, 0], 10, 0)
    const time = ballBallDetector.detect(c1, c2)
    expect(time).toBeUndefined()
  })
})
