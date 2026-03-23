import Circle from './circle'

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

    let minDt = Infinity
    let bestCol = col
    let bestRow = row

    if (vx > 0) {
      const nextCol = col + 1
      if (nextCol < this.cols) {
        const dt = (this.cellSize * nextCol - x) / vx
        if (dt > Number.EPSILON && dt < minDt) {
          minDt = dt
          bestCol = nextCol
          bestRow = row
        }
      }
    } else if (vx < 0) {
      const prevCol = col - 1
      if (prevCol >= 0) {
        const dt = (this.cellSize * col - x) / vx
        if (dt > Number.EPSILON && dt < minDt) {
          minDt = dt
          bestCol = prevCol
          bestRow = row
        }
      }
    }

    if (vy > 0) {
      const nextRow = row + 1
      if (nextRow < this.rows) {
        const dt = (this.cellSize * nextRow - y) / vy
        if (dt > Number.EPSILON && dt < minDt) {
          minDt = dt
          bestCol = col
          bestRow = nextRow
        }
      }
    } else if (vy < 0) {
      const prevRow = row - 1
      if (prevRow >= 0) {
        const dt = (this.cellSize * row - y) / vy
        if (dt > Number.EPSILON && dt < minDt) {
          minDt = dt
          bestCol = col
          bestRow = prevRow
        }
      }
    }

    if (minDt === Infinity) return null

    return { time: circle.time + minDt, toCell: bestRow * this.cols + bestCol }
  }
}
