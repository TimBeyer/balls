/**
 * Compare two benchmark JSON result files and output a markdown table.
 *
 * Usage:
 *   npx tsx scripts/compare-benchmarks.ts baseline.json pr.json
 */

import { readFileSync } from 'node:fs'

interface BenchmarkResult {
  name: string
  opsPerSecond: number
  margin: number
  samples: number
  mean: number
}

function getIndicator(changePct: number): string {
  if (changePct >= 10) return '🚀'
  if (changePct >= 2) return '✅'
  if (changePct > -2) return '➡️'
  if (changePct > -10) return '⚠️'
  return '🔴'
}

function formatOps(ops: number): string {
  return ops.toFixed(2)
}

function formatChange(changePct: number): string {
  const sign = changePct >= 0 ? '+' : ''
  return `${sign}${changePct.toFixed(2)}%`
}

function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/compare-benchmarks.ts <baseline.json> <pr.json>')
    process.exit(1)
  }

  const [baselinePath, prPath] = args

  let baseline: BenchmarkResult[]
  let pr: BenchmarkResult[]

  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'))
  } catch {
    console.error(`Failed to read baseline file: ${baselinePath}`)
    process.exit(1)
  }

  try {
    pr = JSON.parse(readFileSync(prPath, 'utf-8'))
  } catch {
    console.error(`Failed to read PR file: ${prPath}`)
    process.exit(1)
  }

  const baselineMap = new Map(baseline.map((r) => [r.name, r]))
  const prMap = new Map(pr.map((r) => [r.name, r]))

  // Collect all benchmark names (preserving order from PR, then any baseline-only)
  const allNames = [...new Set([...pr.map((r) => r.name), ...baseline.map((r) => r.name)])]

  const lines: string[] = []
  lines.push('## Benchmark Comparison')
  lines.push('')
  lines.push('| Benchmark | Baseline (ops/sec) | PR (ops/sec) | Change | |')
  lines.push('|-----------|-------------------:|-------------:|-------:|-|')

  let totalBaselineOps = 0
  let totalPrOps = 0
  let matchedCount = 0

  for (const name of allNames) {
    const b = baselineMap.get(name)
    const p = prMap.get(name)

    if (b && p) {
      const changePct = ((p.opsPerSecond - b.opsPerSecond) / b.opsPerSecond) * 100
      const indicator = getIndicator(changePct)
      lines.push(
        `| ${name} | ${formatOps(b.opsPerSecond)} | ${formatOps(p.opsPerSecond)} | ${formatChange(changePct)} | ${indicator} |`,
      )
      totalBaselineOps += b.opsPerSecond
      totalPrOps += p.opsPerSecond
      matchedCount++
    } else if (b) {
      lines.push(`| ${name} | ${formatOps(b.opsPerSecond)} | _removed_ | — | |`)
    } else if (p) {
      lines.push(`| ${name} | _new_ | ${formatOps(p.opsPerSecond)} | — | |`)
    }
  }

  lines.push('')

  if (matchedCount > 0) {
    const overallChange = ((totalPrOps - totalBaselineOps) / totalBaselineOps) * 100
    const overallIndicator = getIndicator(overallChange)
    lines.push(`**Overall**: ${formatChange(overallChange)} ${overallIndicator}`)
  }

  console.log(lines.join('\n'))
}

main()
