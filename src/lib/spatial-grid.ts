import Circle from './circle'
import { earliestBoundaryCrossing, LinearBoundary } from './motion'

export interface CellTransition {
  time: number
  toCell: number
}

export class SpatialGrid {
  private cols: number
  private rows: number
  private cellSize: number
  private cells: Circle[][]
  private circleToCell: Map<string, number> = new Map()

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

  addCircle(circle: Circle): void {
    const cell = this.cellFor(circle.position[0], circle.position[1])
    this.cells[cell].push(circle)
    this.circleToCell.set(circle.id, cell)
  }

  removeCircle(circle: Circle): void {
    const cell = this.circleToCell.get(circle.id)
    if (cell === undefined) return
    const arr = this.cells[cell]
    const idx = arr.indexOf(circle)
    if (idx !== -1) arr.splice(idx, 1)
    this.circleToCell.delete(circle.id)
  }

  moveCircle(circle: Circle, toCell: number): void {
    const fromCell = this.circleToCell.get(circle.id)
    if (fromCell !== undefined) {
      const arr = this.cells[fromCell]
      const idx = arr.indexOf(circle)
      if (idx !== -1) arr.splice(idx, 1)
    }
    this.cells[toCell].push(circle)
    this.circleToCell.set(circle.id, toCell)
  }

  getCellOf(circle: Circle): number {
    return this.circleToCell.get(circle.id)!
  }

  getNearbyCircles(circle: Circle): Circle[] {
    const cell = this.circleToCell.get(circle.id)!
    const col = cell % this.cols
    const row = Math.floor(cell / this.cols)
    const result: Circle[] = []

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

  getNextCellTransition(circle: Circle): CellTransition | null {
    const x = circle.position[0]
    const y = circle.position[1]
    const vx = circle.velocity[0]
    const vy = circle.velocity[1]
    const cell = this.circleToCell.get(circle.id)!
    const col = cell % this.cols
    const row = Math.floor(cell / this.cols)

    const boundaries: LinearBoundary[] = []
    const targets: { col: number; row: number }[] = []

    if (vx > 0 && col + 1 < this.cols) {
      boundaries.push({ position: x, velocity: vx, target: this.cellSize * (col + 1) })
      targets.push({ col: col + 1, row })
    } else if (vx < 0 && col > 0) {
      boundaries.push({ position: x, velocity: vx, target: this.cellSize * col })
      targets.push({ col: col - 1, row })
    }

    if (vy > 0 && row + 1 < this.rows) {
      boundaries.push({ position: y, velocity: vy, target: this.cellSize * (row + 1) })
      targets.push({ col, row: row + 1 })
    } else if (vy < 0 && row > 0) {
      boundaries.push({ position: y, velocity: vy, target: this.cellSize * row })
      targets.push({ col, row: row - 1 })
    }

    const result = earliestBoundaryCrossing(boundaries)
    if (!result) return null

    const t = targets[result.index]
    return { time: circle.time + result.dt, toCell: t.row * this.cols + t.col }
  }
}
