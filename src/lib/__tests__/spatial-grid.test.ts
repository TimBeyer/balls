import { describe, it, expect } from 'vitest'
import Circle from '../circle'
import { SpatialGrid } from '../spatial-grid'

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
      // 10 cols (1000/100), 5 rows (500/100)
      expect(grid.cellFor(0, 0)).toBe(0)
      expect(grid.cellFor(50, 0)).toBe(0)
      expect(grid.cellFor(100, 0)).toBe(1)
      expect(grid.cellFor(0, 100)).toBe(10) // row 1, col 0
      expect(grid.cellFor(150, 250)).toBe(21) // row 2, col 1
    })

    it('clamps positions at table boundaries', () => {
      const grid = createGrid()
      expect(grid.cellFor(-10, -10)).toBe(0)
      expect(grid.cellFor(1100, 600)).toBe(49) // last cell: row 4, col 9
    })
  })

  describe('addCircle / removeCircle', () => {
    it('adds and removes circles from cells', () => {
      const grid = createGrid()
      const circle = new Circle([50, 50], [0, 0], 10, 0)
      grid.addCircle(circle)
      expect(grid.getCellOf(circle)).toBe(0)

      const neighbors = grid.getNearbyCircles(circle)
      expect(neighbors).toHaveLength(0) // only circle in grid, excluded from own results

      grid.removeCircle(circle)
      // After removal, getCellOf would fail, but getNearbyCircles on another circle won't find it
      const circle2 = new Circle([50, 50], [0, 0], 10, 0)
      grid.addCircle(circle2)
      expect(grid.getNearbyCircles(circle2)).toHaveLength(0)
    })
  })

  describe('moveCircle', () => {
    it('moves circle to new cell', () => {
      const grid = createGrid()
      const circle = new Circle([50, 50], [1, 0], 10, 0)
      grid.addCircle(circle)
      expect(grid.getCellOf(circle)).toBe(0)

      grid.moveCircle(circle, 1)
      expect(grid.getCellOf(circle)).toBe(1)
    })
  })

  describe('getNearbyCircles', () => {
    it('returns circles in adjacent cells', () => {
      const grid = createGrid()
      const center = new Circle([150, 150], [0, 0], 10, 0) // cell (1,1) = index 11
      const neighbor = new Circle([250, 150], [0, 0], 10, 0) // cell (2,1) = index 12
      const far = new Circle([550, 450], [0, 0], 10, 0) // cell (5,4) = index 45

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
      const corner = new Circle([50, 50], [0, 0], 10, 0) // cell (0,0)
      const adjacent = new Circle([150, 50], [0, 0], 10, 0) // cell (1,0)

      grid.addCircle(corner)
      grid.addCircle(adjacent)

      const nearby = grid.getNearbyCircles(corner)
      expect(nearby).toContain(adjacent)
    })
  })

  describe('getNextCellTransition', () => {
    it('computes transition for rightward movement', () => {
      const grid = createGrid()
      const circle = new Circle([50, 50], [100, 0], 10, 0)
      grid.addCircle(circle)

      const transition = grid.getNextCellTransition(circle)
      expect(transition).not.toBeNull()
      // Next grid line at x=100, dt = (100 - 50) / 100 = 0.5
      expect(transition!.time).toBeCloseTo(0.5)
      expect(transition!.toCell).toBe(1) // col 1, row 0
    })

    it('computes transition for downward movement', () => {
      const grid = createGrid()
      const circle = new Circle([50, 50], [0, 200], 10, 0)
      grid.addCircle(circle)

      const transition = grid.getNextCellTransition(circle)
      expect(transition).not.toBeNull()
      // Next grid line at y=100, dt = (100 - 50) / 200 = 0.25
      expect(transition!.time).toBeCloseTo(0.25)
      expect(transition!.toCell).toBe(10) // col 0, row 1
    })

    it('picks the earlier axis crossing', () => {
      const grid = createGrid()
      // At (50, 80), velocity (100, 200)
      // x crossing at x=100: dt = 50/100 = 0.5
      // y crossing at y=100: dt = 20/200 = 0.1 — this wins
      const circle = new Circle([50, 80], [100, 200], 10, 0)
      grid.addCircle(circle)

      const transition = grid.getNextCellTransition(circle)
      expect(transition).not.toBeNull()
      expect(transition!.time).toBeCloseTo(0.1)
      expect(transition!.toCell).toBe(10) // col 0, row 1
    })

    it('returns null for zero velocity', () => {
      const grid = createGrid()
      const circle = new Circle([50, 50], [0, 0], 10, 0)
      grid.addCircle(circle)

      expect(grid.getNextCellTransition(circle)).toBeNull()
    })

    it('returns null at table boundary moving outward', () => {
      const grid = createGrid()
      // In rightmost column (col 9), moving right — no cell to transition to
      const circle = new Circle([950, 50], [100, 0], 10, 0)
      grid.addCircle(circle)

      expect(grid.getNextCellTransition(circle)).toBeNull()
    })

    it('computes transition for leftward movement', () => {
      const grid = createGrid()
      const circle = new Circle([150, 50], [-100, 0], 10, 0)
      grid.addCircle(circle)

      const transition = grid.getNextCellTransition(circle)
      expect(transition).not.toBeNull()
      // At col 1, moving left. Grid line at x=100, dt = (100 - 150) / -100 = 0.5
      expect(transition!.time).toBeCloseTo(0.5)
      expect(transition!.toCell).toBe(0) // col 0, row 0
    })

    it('uses circle.time as offset for absolute time', () => {
      const grid = createGrid()
      const circle = new Circle([50, 50], [100, 0], 10, 5.0) // time starts at 5.0
      grid.addCircle(circle)

      const transition = grid.getNextCellTransition(circle)
      expect(transition).not.toBeNull()
      // dt = (100 - 50) / 100 = 0.5, absolute time = 5.0 + 0.5 = 5.5
      expect(transition!.time).toBeCloseTo(5.5)
    })
  })
})
