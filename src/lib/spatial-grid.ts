import type Ball from './ball'
import { solveQuadratic } from './polynomial-solver'

export interface CellTransition {
  time: number
  toCell: number
}

export class SpatialGrid {
  private cols: number
  private rows: number
  private cellSize: number
  private cells: Ball[][]
  private circleToCell: Map<string, number> = new Map()
  /** Reusable buffer for getNearbyCircles to avoid allocating a new array per call */
  private neighborBuf: Ball[] = []

  constructor(tableWidth: number, tableHeight: number, cellSize: number) {
    this.cellSize = cellSize
    this.cols = Math.ceil(tableWidth / cellSize)
    this.rows = Math.ceil(tableHeight / cellSize)
    this.cells = Array.from({ length: this.cols * this.rows }, () => [])
  }

  cellFor(x: number, y: number): number {
    const col = Math.min(Math.max(Math.floor(x / this.cellSize), 0), this.cols - 1)
    const row = Math.min(Math.max(Math.floor(y / this.cellSize), 0), this.rows - 1)
    return row * this.cols + col
  }

  addCircle(circle: Ball): void {
    const cell = this.cellFor(circle.position[0], circle.position[1])
    this.cells[cell].push(circle)
    this.circleToCell.set(circle.id, cell)
  }

  removeCircle(circle: Ball): void {
    const cell = this.circleToCell.get(circle.id)
    if (cell === undefined) return
    const arr = this.cells[cell]
    const idx = arr.indexOf(circle)
    if (idx !== -1) arr.splice(idx, 1)
    this.circleToCell.delete(circle.id)
  }

  moveCircle(circle: Ball, toCell: number): void {
    const fromCell = this.circleToCell.get(circle.id)
    if (fromCell !== undefined) {
      const arr = this.cells[fromCell]
      const idx = arr.indexOf(circle)
      if (idx !== -1) arr.splice(idx, 1)
    }
    this.cells[toCell].push(circle)
    this.circleToCell.set(circle.id, toCell)
  }

  getCellOf(circle: Ball): number {
    return this.circleToCell.get(circle.id)!
  }

  getNearbyCircles(circle: Ball): Ball[] {
    const cell = this.circleToCell.get(circle.id)!
    const col = cell % this.cols
    const row = Math.floor(cell / this.cols)
    const result = this.neighborBuf
    result.length = 0

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr
        const nc = col + dc
        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue
        const cellCircles = this.cells[nr * this.cols + nc]
        for (let i = 0; i < cellCircles.length; i++) {
          if (cellCircles[i] !== circle) result.push(cellCircles[i])
        }
      }
    }

    return result
  }

  /**
   * Compute when a ball crosses into an adjacent spatial grid cell.
   * With quadratic trajectories: x(t) = a*t^2 + b*t + c, solve for boundary crossing.
   */
  getNextCellTransition(circle: Ball): CellTransition | null {
    const traj = circle.trajectory
    const cell = this.circleToCell.get(circle.id)!
    const col = cell % this.cols
    const row = Math.floor(cell / this.cols)

    let minDt = Infinity
    let toCol = col
    let toRow = row

    // Check x-axis boundaries
    const checkXBoundary = (boundary: number, newCol: number) => {
      // Solve a_x * t^2 + b_x * t + (c_x - boundary) = 0
      const roots = solveQuadratic(traj.a[0], traj.b[0], traj.c[0] - boundary)
      for (const t of roots) {
        if (t >= 0 && t < minDt) {
          // Verify velocity at time t points toward the new cell
          const vx = 2 * traj.a[0] * t + traj.b[0]
          if ((newCol > col && vx > 0) || (newCol < col && vx < 0)) {
            minDt = t
            toCol = newCol
            toRow = row
          }
        }
      }
    }

    if (col + 1 < this.cols) checkXBoundary(this.cellSize * (col + 1), col + 1)
    if (col > 0) checkXBoundary(this.cellSize * col, col - 1)

    // Check y-axis boundaries
    const checkYBoundary = (boundary: number, newRow: number) => {
      const roots = solveQuadratic(traj.a[1], traj.b[1], traj.c[1] - boundary)
      for (const t of roots) {
        if (t >= 0 && t < minDt) {
          const vy = 2 * traj.a[1] * t + traj.b[1]
          if ((newRow > row && vy > 0) || (newRow < row && vy < 0)) {
            minDt = t
            toCol = col
            toRow = newRow
          }
        }
      }
    }

    if (row + 1 < this.rows) checkYBoundary(this.cellSize * (row + 1), row + 1)
    if (row > 0) checkYBoundary(this.cellSize * row, row - 1)

    if (minDt === Infinity) return null
    // Clamp to a tiny positive dt to avoid zero-time events in the priority queue
    const clampedDt = Math.max(minDt, 1e-12)
    return { time: circle.time + clampedDt, toCell: toRow * this.cols + toCol }
  }
}
