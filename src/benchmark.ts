import { Bench } from 'tinybench'
import Circle from './lib/circle'
import { simulate } from './lib/simulation'
import type Vector2D from './lib/vector2d'

// Measurements in millimeters
const TABLE_WIDTH = 2840
const TABLE_HEIGHT = 1420
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

function generateCircles(numCircles: number, seed: number): Circle[] {
  const random = mulberry32(seed)

  const randomCircle = (): Circle => {
    const x = random() * (TABLE_WIDTH - 2 * RADIUS) + RADIUS
    const y = random() * (TABLE_HEIGHT - 2 * RADIUS) + RADIUS
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
}

const CASES: BenchmarkCase[] = [
  { name: '10 circles / 60s', numCircles: 10, seed: 1001 },
  { name: '20 circles / 60s', numCircles: 20, seed: 2002 },
  { name: '40 circles / 60s', numCircles: 40, seed: 3003 },
  { name: '80 circles / 60s', numCircles: 80, seed: 4004 },
  { name: '150 circles / 60s', numCircles: 150, seed: 5005 },
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
    console.log(`Table: ${TABLE_WIDTH}x${TABLE_HEIGHT}mm, Ball radius: ${RADIUS}mm`)
    console.log(`Simulation time: ${SIMULATION_TIME / 1000}s per run`)
    console.log('---')
  }

  // Pre-generate all circle sets (not timed)
  if (!jsonMode) console.log('Generating circle layouts...')
  const circleSetups = new Map<string, Circle[]>()
  for (const c of CASES) {
    circleSetups.set(c.name, generateCircles(c.numCircles, c.seed))
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
      simulate(TABLE_WIDTH, TABLE_HEIGHT, SIMULATION_TIME, circles)
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
    console.log(JSON.stringify(results, null, 2))
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
