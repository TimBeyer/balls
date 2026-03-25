import { describe, it, expect } from 'vitest'
import {
  solveLinear,
  solveQuadratic,
  solveCubic,
  solveQuartic,
  smallestPositiveRoot,
} from '../polynomial-solver'

describe('solveLinear', () => {
  it('solves ax + b = 0', () => {
    expect(solveLinear(2, -6)).toEqual([3])
    expect(solveLinear(1, 0)).toEqual([0])
    expect(solveLinear(-3, 9)).toEqual([3])
  })

  it('returns empty for zero coefficient', () => {
    expect(solveLinear(0, 5)).toEqual([])
  })
})

describe('solveQuadratic', () => {
  it('solves x^2 - 5x + 6 = 0 → roots 2, 3', () => {
    const roots = solveQuadratic(1, -5, 6).sort((a, b) => a - b)
    expect(roots).toHaveLength(2)
    expect(roots[0]).toBeCloseTo(2, 8)
    expect(roots[1]).toBeCloseTo(3, 8)
  })

  it('solves x^2 - 4 = 0 → roots -2, 2', () => {
    const roots = solveQuadratic(1, 0, -4).sort((a, b) => a - b)
    expect(roots).toHaveLength(2)
    expect(roots[0]).toBeCloseTo(-2, 8)
    expect(roots[1]).toBeCloseTo(2, 8)
  })

  it('returns single root for zero discriminant', () => {
    const roots = solveQuadratic(1, -4, 4) // (x-2)^2
    expect(roots).toHaveLength(1)
    expect(roots[0]).toBeCloseTo(2, 8)
  })

  it('returns empty for negative discriminant', () => {
    expect(solveQuadratic(1, 0, 1)).toEqual([]) // x^2 + 1 = 0
  })

  it('degenerates to linear when a ≈ 0', () => {
    const roots = solveQuadratic(0, 2, -6)
    expect(roots).toHaveLength(1)
    expect(roots[0]).toBeCloseTo(3, 8)
  })
})

describe('solveCubic', () => {
  it('solves (x-1)(x-2)(x-3) = x^3 - 6x^2 + 11x - 6', () => {
    const roots = solveCubic(1, -6, 11, -6).sort((a, b) => a - b)
    expect(roots).toHaveLength(3)
    expect(roots[0]).toBeCloseTo(1, 6)
    expect(roots[1]).toBeCloseTo(2, 6)
    expect(roots[2]).toBeCloseTo(3, 6)
  })

  it('solves cubic with one real root: x^3 + x + 1 = 0', () => {
    const roots = solveCubic(1, 0, 1, 1)
    expect(roots.length).toBeGreaterThanOrEqual(1)
    // Verify root satisfies equation
    for (const r of roots) {
      expect(r * r * r + r + 1).toBeCloseTo(0, 6)
    }
  })

  it('handles repeated roots: (x-2)^2(x+1) = x^3 - 3x^2 + 4', () => {
    const roots = solveCubic(1, -3, 0, 4).sort((a, b) => a - b)
    expect(roots.length).toBeGreaterThanOrEqual(2)
    // Should have roots at -1 and 2 (possibly repeated)
    const hasNeg1 = roots.some((r) => Math.abs(r + 1) < 0.01)
    const has2 = roots.some((r) => Math.abs(r - 2) < 0.01)
    expect(hasNeg1).toBe(true)
    expect(has2).toBe(true)
  })

  it('degenerates to quadratic when a ≈ 0', () => {
    const roots = solveCubic(0, 1, -5, 6).sort((a, b) => a - b)
    expect(roots).toHaveLength(2)
    expect(roots[0]).toBeCloseTo(2, 6)
    expect(roots[1]).toBeCloseTo(3, 6)
  })
})

describe('solveQuartic', () => {
  it('solves (x-1)(x-2)(x-3)(x-4) = x^4 - 10x^3 + 35x^2 - 50x + 24', () => {
    const roots = solveQuartic(1, -10, 35, -50, 24).sort((a, b) => a - b)
    expect(roots).toHaveLength(4)
    expect(roots[0]).toBeCloseTo(1, 5)
    expect(roots[1]).toBeCloseTo(2, 5)
    expect(roots[2]).toBeCloseTo(3, 5)
    expect(roots[3]).toBeCloseTo(4, 5)
  })

  it('solves biquadratic: x^4 - 5x^2 + 4 = (x^2-1)(x^2-4)', () => {
    const roots = solveQuartic(1, 0, -5, 0, 4).sort((a, b) => a - b)
    expect(roots).toHaveLength(4)
    expect(roots[0]).toBeCloseTo(-2, 6)
    expect(roots[1]).toBeCloseTo(-1, 6)
    expect(roots[2]).toBeCloseTo(1, 6)
    expect(roots[3]).toBeCloseTo(2, 6)
  })

  it('solves quartic with only 2 real roots', () => {
    // (x^2 + 1)(x - 1)(x - 2) = x^4 - 3x^3 + 3x^2 - 3x + 2
    const roots = solveQuartic(1, -3, 3, -3, 2).sort((a, b) => a - b)
    expect(roots).toHaveLength(2)
    expect(roots[0]).toBeCloseTo(1, 5)
    expect(roots[1]).toBeCloseTo(2, 5)
  })

  it('solves quartic with no real roots', () => {
    // (x^2 + 1)(x^2 + 2) = x^4 + 3x^2 + 2
    const roots = solveQuartic(1, 0, 3, 0, 2)
    expect(roots).toHaveLength(0)
  })

  it('degenerates to cubic when a ≈ 0', () => {
    const roots = solveQuartic(0, 1, -6, 11, -6).sort((a, b) => a - b)
    expect(roots).toHaveLength(3)
    expect(roots[0]).toBeCloseTo(1, 5)
    expect(roots[1]).toBeCloseTo(2, 5)
    expect(roots[2]).toBeCloseTo(3, 5)
  })

  it('handles all roots being the same: (x-3)^4', () => {
    // x^4 - 12x^3 + 54x^2 - 108x + 81
    const roots = solveQuartic(1, -12, 54, -108, 81)
    expect(roots.length).toBeGreaterThanOrEqual(1)
    for (const r of roots) {
      expect(r).toBeCloseTo(3, 4)
    }
  })
})

describe('smallestPositiveRoot', () => {
  it('returns smallest positive root of quadratic', () => {
    // x^2 - 5x + 6 = 0 → roots 2, 3 → smallest positive = 2
    const result = smallestPositiveRoot([1, -5, 6])
    expect(result).toBeCloseTo(2, 8)
  })

  it('returns smallest positive root of quartic', () => {
    // (x-1)(x-2)(x-3)(x-4) → smallest positive = 1
    const result = smallestPositiveRoot([1, -10, 35, -50, 24])
    expect(result).toBeCloseTo(1, 5)
  })

  it('skips negative roots', () => {
    // (x+2)(x-3) = x^2 - x - 6 → roots -2, 3 → smallest positive = 3
    const result = smallestPositiveRoot([1, -1, -6])
    expect(result).toBeCloseTo(3, 8)
  })

  it('returns undefined when no positive roots exist', () => {
    // x^2 + 1 = 0 → no real roots
    expect(smallestPositiveRoot([1, 0, 1])).toBeUndefined()
  })

  it('returns undefined for all negative roots', () => {
    // (x+1)(x+2) = x^2 + 3x + 2
    expect(smallestPositiveRoot([1, 3, 2])).toBeUndefined()
  })

  it('handles leading zero coefficients (quartic degenerating to quadratic)', () => {
    // 0*x^4 + 0*x^3 + 1*x^2 - 5x + 6 → roots 2, 3
    const result = smallestPositiveRoot([0, 0, 1, -5, 6])
    expect(result).toBeCloseTo(2, 8)
  })

  it('returns undefined for constant polynomial', () => {
    expect(smallestPositiveRoot([5])).toBeUndefined()
  })

  it('handles linear polynomial', () => {
    // 2x - 6 = 0 → x = 3
    expect(smallestPositiveRoot([2, -6])).toBeCloseTo(3, 8)
  })

  it('filters roots very close to zero', () => {
    // (x - 0)(x - 5) = x^2 - 5x — root at 0 should be skipped, return 5
    const result = smallestPositiveRoot([1, -5, 0])
    expect(result).toBeCloseTo(5, 8)
  })
})
