import { describe, it, expect } from 'vitest'
import { SpatialGrid } from '../spatial-grid'
import { createTestBall } from './test-helpers'

describe('SpatialGrid', () => {
  const TABLE_WIDTH = 1000
  const TABLE_HEIGHT = 500
  const CELL_SIZE = 100

  function createGrid() {
    return new SpatialGrid(TABLE_WIDTH, TABLE_HEIGHT, CELL_SIZE)
  }

  describe('cellFor', () => {
    it('computes correct cell index', () => {
      const grid = createGrid()
      expect(grid.cellFor(0, 0)).toBe(0)
      expect(grid.cellFor(50, 0)).toBe(0)
      expect(grid.cellFor(100, 0)).toBe(1)
      expect(grid.cellFor(0, 100)).toBe(10)
      expect(grid.cellFor(150, 250)).toBe(21)
    })

    it('clamps positions at table boundaries', () => {
      const grid = createGrid()
      expect(grid.cellFor(-10, -10)).toBe(0)
      expect(grid.cellFor(1100, 600)).toBe(49)
    })
  })

  describe('addCircle / removeCircle', () => {
    it('adds and removes circles from cells', () => {
      const grid = createGrid()
      const circle = createTestBall([50, 50], [0, 0], 10, 0)
      grid.addCircle(circle)
      expect(grid.getCellOf(circle)).toBe(0)

      const neighbors = grid.getNearbyCircles(circle)
      expect(neighbors).toHaveLength(0)

      grid.removeCircle(circle)
      const circle2 = createTestBall([50, 50], [0, 0], 10, 0)
      grid.addCircle(circle2)
      expect(grid.getNearbyCircles(circle2)).toHaveLength(0)
    })
  })

  describe('moveCircle', () => {
    it('moves circle to new cell', () => {
      const grid = createGrid()
      const circle = createTestBall([50, 50], [1, 0], 10, 0)
      grid.addCircle(circle)
      expect(grid.getCellOf(circle)).toBe(0)

      grid.moveCircle(circle, 1)
      expect(grid.getCellOf(circle)).toBe(1)
    })
  })

  describe('getNearbyCircles', () => {
    it('returns circles in adjacent cells', () => {
      const grid = createGrid()
      const center = createTestBall([150, 150], [0, 0], 10, 0)
      const neighbor = createTestBall([250, 150], [0, 0], 10, 0)
      const far = createTestBall([550, 450], [0, 0], 10, 0)

      grid.addCircle(center)
      grid.addCircle(neighbor)
      grid.addCircle(far)

      const nearby = grid.getNearbyCircles(center)
      expect(nearby).toContain(neighbor)
      expect(nearby).not.toContain(far)
      expect(nearby).not.toContain(center)
    })

    it('handles corner cells correctly', () => {
      const grid = createGrid()
      const corner = createTestBall([50, 50], [0, 0], 10, 0)
      const adjacent = createTestBall([150, 50], [0, 0], 10, 0)

      grid.addCircle(corner)
      grid.addCircle(adjacent)

      const nearby = grid.getNearbyCircles(corner)
      expect(nearby).toContain(adjacent)
    })
  })

  describe('getNextCellTransition', () => {
    it('computes transition for rightward movement', () => {
      const grid = createGrid()
      const circle = createTestBall([50, 50], [100, 0], 10, 0)
      grid.addCircle(circle)

      const transition = grid.getNextCellTransition(circle)
      expect(transition).not.toBeNull()
      expect(transition!.time).toBeCloseTo(0.5)
      expect(transition!.toCell).toBe(1)
    })

    it('computes transition for downward movement', () => {
      const grid = createGrid()
      const circle = createTestBall([50, 50], [0, 200], 10, 0)
      grid.addCircle(circle)

      const transition = grid.getNextCellTransition(circle)
      expect(transition).not.toBeNull()
      expect(transition!.time).toBeCloseTo(0.25)
      expect(transition!.toCell).toBe(10)
    })

    it('picks the earlier axis crossing', () => {
      const grid = createGrid()
      const circle = createTestBall([50, 80], [100, 200], 10, 0)
      grid.addCircle(circle)

      const transition = grid.getNextCellTransition(circle)
      expect(transition).not.toBeNull()
      expect(transition!.time).toBeCloseTo(0.1)
      expect(transition!.toCell).toBe(10)
    })

    it('returns null for zero velocity', () => {
      const grid = createGrid()
      const circle = createTestBall([50, 50], [0, 0], 10, 0)
      grid.addCircle(circle)

      expect(grid.getNextCellTransition(circle)).toBeNull()
    })

    it('returns null at table boundary moving outward', () => {
      const grid = createGrid()
      const circle = createTestBall([950, 50], [100, 0], 10, 0)
      grid.addCircle(circle)

      expect(grid.getNextCellTransition(circle)).toBeNull()
    })

    it('computes transition for leftward movement', () => {
      const grid = createGrid()
      const circle = createTestBall([150, 50], [-100, 0], 10, 0)
      grid.addCircle(circle)

      const transition = grid.getNextCellTransition(circle)
      expect(transition).not.toBeNull()
      expect(transition!.time).toBeCloseTo(0.5)
      expect(transition!.toCell).toBe(0)
    })

    it('uses circle.time as offset for absolute time', () => {
      const grid = createGrid()
      const circle = createTestBall([50, 50], [100, 0], 10, 5.0)
      grid.addCircle(circle)

      const transition = grid.getNextCellTransition(circle)
      expect(transition).not.toBeNull()
      expect(transition!.time).toBeCloseTo(5.5)
    })
  })
})
