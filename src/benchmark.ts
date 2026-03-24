import { writeFileSync } from 'node:fs'
import { Bench } from 'tinybench'
import Circle from './lib/circle'
import { simulate } from './lib/simulation'
import type Vector2D from './lib/vector2d'

// Measurements in millimeters
const DEFAULT_TABLE_WIDTH = 2840
const DEFAULT_TABLE_HEIGHT = 1420
const RADIUS = 37.5
const SIMULATION_TIME = 60000

// --- Seeded PRNG (mulberry32) for deterministic benchmarks ---
function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Legacy brute-force generation — kept for backward compatibility of original 5 cases
function generateCirclesLegacy(numCircles: number, seed: number): Circle[] {
  const random = mulberry32(seed)

  const randomCircle = (): Circle => {
    const x = random() * (DEFAULT_TABLE_WIDTH - 2 * RADIUS) + RADIUS
    const y = random() * (DEFAULT_TABLE_HEIGHT - 2 * RADIUS) + RADIUS
    const velocity: Vector2D = [random() * 0.7 - random() * 1.4, random() * 0.7 - random() * 1.4]
    return new Circle([x, y], velocity, RADIUS, 0)
  }

  const circlesCollide = (c1: Circle, c2: Circle): boolean => {
    const dx = c1.x - c2.x
    const dy = c1.y - c2.y
    const dist = c1.radius + c2.radius
    return dx * dx + dy * dy <= dist * dist
  }

  let circles: Circle[] = []

  while (circles.length <= numCircles) {
    let currentCircle = randomCircle()
    let collides = circles.some((c) => circlesCollide(c, currentCircle))
    let attemptCount = 1
    while (collides) {
      attemptCount += 1
      currentCircle = randomCircle()
      collides = circles.some((c) => circlesCollide(c, currentCircle))
      if (attemptCount > 5000) {
        circles = []
        attemptCount = 0
      }
    }
    circles.push(currentCircle)
  }

  return circles
}

// Grid-based generation — reliable placement for any ball count with appropriately sized tables
function generateCirclesGrid(numCircles: number, tableWidth: number, tableHeight: number, seed: number): Circle[] {
  const random = mulberry32(seed)
  const gap = 10
  const cellSize = RADIUS * 2 + gap
  const maxJitter = gap / 2

  const usableWidth = tableWidth - 2 * RADIUS
  const usableHeight = tableHeight - 2 * RADIUS
  const cols = Math.floor(usableWidth / cellSize)
  const rows = Math.floor(usableHeight / cellSize)
  const totalCells = rows * cols

  // +1 to match legacy off-by-one (generates numCircles + 1 circles)
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

function generateCircles(numCircles: number, tableWidth: number, tableHeight: number, seed: number): Circle[] {
  if (tableWidth === DEFAULT_TABLE_WIDTH && tableHeight === DEFAULT_TABLE_HEIGHT && numCircles <= 150) {
    return generateCirclesLegacy(numCircles, seed)
  }
  return generateCirclesGrid(numCircles, tableWidth, tableHeight, seed)
}

function cloneCircles(circles: Circle[]): Circle[] {
  return circles.map(
    (c) => new Circle([c.position[0], c.position[1]], [c.velocity[0], c.velocity[1]], c.radius, c.time, c.mass, c.id),
  )
}

// --- Benchmark configuration ---
interface BenchmarkCase {
  name: string
  numCircles: number
  seed: number
  tableWidth: number
  tableHeight: number
}

const CASES: BenchmarkCase[] = [
  { name: '10 circles / 60s', numCircles: 10, seed: 1001, tableWidth: 2840, tableHeight: 1420 },
  { name: '20 circles / 60s', numCircles: 20, seed: 2002, tableWidth: 2840, tableHeight: 1420 },
  { name: '40 circles / 60s', numCircles: 40, seed: 3003, tableWidth: 2840, tableHeight: 1420 },
  { name: '80 circles / 60s', numCircles: 80, seed: 4004, tableWidth: 2840, tableHeight: 1420 },
  { name: '150 circles / 60s', numCircles: 150, seed: 5005, tableWidth: 2840, tableHeight: 1420 },
  { name: '300 circles / 60s', numCircles: 300, seed: 6006, tableWidth: 4020, tableHeight: 2010 },
  { name: '500 circles / 60s', numCircles: 500, seed: 7007, tableWidth: 5190, tableHeight: 2595 },
  { name: '1000 circles / 60s', numCircles: 1000, seed: 8008, tableWidth: 7340, tableHeight: 3670 },
]

interface BenchmarkResult {
  name: string
  opsPerSecond: number
  margin: number
  samples: number
  mean: number
}

async function runBenchmarks(): Promise<BenchmarkResult[]> {
  const jsonMode = process.argv.includes('--json')

  if (!jsonMode) {
    console.log(`Billiards Simulation Benchmark`)
    console.log(`Ball radius: ${RADIUS}mm`)
    console.log(`Simulation time: ${SIMULATION_TIME / 1000}s per run`)
    console.log('---')
  }

  // Pre-generate all circle sets (not timed)
  if (!jsonMode) console.log('Generating circle layouts...')
  const circleSetups = new Map<string, Circle[]>()
  for (const c of CASES) {
    if (!jsonMode) console.log(`  ${c.name}: ${c.tableWidth}x${c.tableHeight}mm table`)
    circleSetups.set(c.name, generateCircles(c.numCircles, c.tableWidth, c.tableHeight, c.seed))
  }
  if (!jsonMode) console.log('Done.\n')

  const bench = new Bench({
    warmupIterations: 1,
    iterations: 5,
    time: 0,
  })

  for (const c of CASES) {
    const setupCircles = circleSetups.get(c.name)!
    bench.add(c.name, () => {
      const circles = cloneCircles(setupCircles)
      simulate(c.tableWidth, c.tableHeight, SIMULATION_TIME, circles)
    })
  }

  await bench.run()

  const results: BenchmarkResult[] = bench.tasks.map((task) => {
    const result = task.result!
    const latency = result.latency
    const opsPerSecond = 1_000 / latency.mean
    const margin = latency.rme
    return {
      name: task.name,
      opsPerSecond,
      margin,
      samples: latency.samplesCount,
      mean: latency.mean,
    }
  })

  if (jsonMode) {
    const outputIdx = process.argv.indexOf('--output')
    const json = JSON.stringify(results, null, 2)
    if (outputIdx !== -1 && process.argv[outputIdx + 1]) {
      writeFileSync(process.argv[outputIdx + 1], json + '\n')
    } else {
      console.log(json)
    }
  } else {
    for (const r of results) {
      console.log(
        `${r.name} x ${r.opsPerSecond.toFixed(2)} ops/sec \xB1${r.margin.toFixed(2)}% (${r.samples} runs sampled)`,
      )
    }
  }

  return results
}

runBenchmarks().catch((err) => {
  console.error(err)
  process.exit(1)
})
