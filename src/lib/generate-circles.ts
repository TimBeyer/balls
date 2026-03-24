import Circle from './circle'
import type Vector2D from './vector2d'

const RADIUS = 37.5

export function generateCircles(
  numCircles: number,
  tableWidth: number,
  tableHeight: number,
  random: () => number,
): Circle[] {
  const gap = 10
  const cellSize = RADIUS * 2 + gap
  const maxJitter = gap / 2

  const usableWidth = tableWidth - 2 * RADIUS
  const usableHeight = tableHeight - 2 * RADIUS
  const cols = Math.floor(usableWidth / cellSize)
  const rows = Math.floor(usableHeight / cellSize)
  const totalCells = rows * cols

  const count = numCircles + 1

  if (count > totalCells) {
    throw new Error(
      `Table ${tableWidth}x${tableHeight}mm too small for ${numCircles} circles (grid has ${totalCells} cells, need ${count})`,
    )
  }

  // Fisher-Yates shuffle to pick random cells
  const cellIndices = Array.from({ length: totalCells }, (_, i) => i)
  for (let i = totalCells - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = cellIndices[i]
    cellIndices[i] = cellIndices[j]
    cellIndices[j] = tmp
  }

  const circles: Circle[] = []
  for (let i = 0; i < count; i++) {
    const cellIndex = cellIndices[i]
    const row = Math.floor(cellIndex / cols)
    const col = cellIndex % cols

    const cx = RADIUS + col * cellSize + cellSize / 2
    const cy = RADIUS + row * cellSize + cellSize / 2

    const x = cx + (random() * 2 - 1) * maxJitter
    const y = cy + (random() * 2 - 1) * maxJitter

    const velocity: Vector2D = [random() * 0.7 - random() * 1.4, random() * 0.7 - random() * 1.4]
    circles.push(new Circle([x, y], velocity, RADIUS, 0))
  }

  return circles
}
