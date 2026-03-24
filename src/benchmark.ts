import { writeFileSync } from 'node:fs'
import { Bench } from 'tinybench'
import Circle from './lib/circle'
import { generateCircles } from './lib/generate-circles'
import { simulate } from './lib/simulation'

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
    console.log(`Ball radius: 37.5mm`)
    console.log(`Simulation time: ${SIMULATION_TIME / 1000}s per run`)
    console.log('---')
  }

  // Pre-generate all circle sets (not timed)
  if (!jsonMode) console.log('Generating circle layouts...')
  const circleSetups = new Map<string, Circle[]>()
  for (const c of CASES) {
    if (!jsonMode) console.log(`  ${c.name}: ${c.tableWidth}x${c.tableHeight}mm table`)
    circleSetups.set(c.name, generateCircles(c.numCircles, c.tableWidth, c.tableHeight, mulberry32(c.seed)))
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
