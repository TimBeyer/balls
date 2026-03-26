/**
 * Polynomial root finding for degrees 1-4.
 *
 * Used by collision detection: ball-ball collisions with quadratic trajectories
 * produce quartic polynomials, ball-cushion produce quadratics.
 *
 * All solvers return real roots only. `smallestPositiveRoot` filters for the
 * earliest future collision time.
 */

const EPSILON = 1e-9

/**
 * Find the smallest positive real root of a polynomial.
 * Coefficients are ordered highest degree first: [a_n, a_{n-1}, ..., a_1, a_0]
 * e.g. for ax^4 + bx^3 + cx^2 + dx + e: [a, b, c, d, e]
 *
 * Handles degenerate cases where leading coefficients are zero
 * (quartic degenerates to cubic, cubic to quadratic, etc.)
 */
export function smallestPositiveRoot(coeffs: number[]): number | undefined {
  // Strip leading near-zero coefficients
  let start = 0
  while (start < coeffs.length - 1 && Math.abs(coeffs[start]) < EPSILON) {
    start++
  }

  const degree = coeffs.length - 1 - start
  if (degree <= 0) return undefined

  let roots: number[]
  if (degree === 1) {
    roots = solveLinear(coeffs[start], coeffs[start + 1])
  } else if (degree === 2) {
    roots = solveQuadratic(coeffs[start], coeffs[start + 1], coeffs[start + 2])
  } else if (degree === 3) {
    roots = solveCubic(coeffs[start], coeffs[start + 1], coeffs[start + 2], coeffs[start + 3])
  } else if (degree === 4) {
    roots = solveQuartic(coeffs[start], coeffs[start + 1], coeffs[start + 2], coeffs[start + 3], coeffs[start + 4])
  } else {
    return undefined
  }

  let best: number | undefined
  for (const r of roots) {
    if (r > EPSILON && (best === undefined || r < best)) {
      best = r
    }
  }

  // Fallback for near-contact collisions: when the quartic solver (Ferrari's method)
  // fails due to floating-point precision loss, the polynomial has a small positive
  // constant term and a negative linear term (balls nearly touching and approaching).
  // Use Newton's method to find the root the algebraic solver missed.
  if (best === undefined && degree >= 2) {
    const an = coeffs[start]
    const e0 = coeffs[start + degree] // constant term
    const e1 = coeffs[start + degree - 1] // linear term
    if (e0 > 0 && e0 < 1e-2 * Math.abs(an) && e1 < 0) {
      // Linear approximation as initial guess: t ≈ -e0/e1
      let t = -e0 / e1
      // Newton's method refinement (5 iterations)
      for (let i = 0; i < 5; i++) {
        let f = 0
        let fp = 0
        for (let j = start; j <= start + degree; j++) {
          f = f * t + coeffs[j]
          if (j < start + degree) fp = fp * t + coeffs[j] * (start + degree - j)
        }
        if (Math.abs(fp) < EPSILON) break
        t -= f / fp
        if (t <= 0) break
      }
      if (t > EPSILON) {
        best = t
      }
    }
  }

  return best
}

/** Solve ax + b = 0 */
export function solveLinear(a: number, b: number): number[] {
  if (Math.abs(a) < EPSILON) return []
  const root = -b / a
  return [root === 0 ? 0 : root] // avoid -0
}

/** Solve ax^2 + bx + c = 0. Returns real roots only. */
export function solveQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < EPSILON) return solveLinear(b, c)

  const discriminant = b * b - 4 * a * c
  if (discriminant < -EPSILON) return []

  if (discriminant < EPSILON) {
    return [-b / (2 * a)]
  }

  const sqrtD = Math.sqrt(discriminant)
  const twoA = 2 * a
  return [(-b - sqrtD) / twoA, (-b + sqrtD) / twoA]
}

/**
 * Solve ax^3 + bx^2 + cx + d = 0 using Cardano's method.
 * Returns 1 or 3 real roots.
 */
export function solveCubic(a: number, b: number, c: number, d: number): number[] {
  if (Math.abs(a) < EPSILON) return solveQuadratic(b, c, d)

  // Normalize: x^3 + px^2 + qx + r = 0
  const p = b / a
  const q = c / a
  const r = d / a

  // Depressed cubic substitution: t = x - p/3
  // t^3 + pt + q = 0 where p, q are redefined
  const p1 = q - (p * p) / 3
  const q1 = r - (p * q) / 3 + (2 * p * p * p) / 27

  const discriminant = (q1 * q1) / 4 + (p1 * p1 * p1) / 27
  const offset = -p / 3

  if (discriminant > EPSILON) {
    // One real root
    const sqrtD = Math.sqrt(discriminant)
    const u = Math.cbrt(-q1 / 2 + sqrtD)
    const v = Math.cbrt(-q1 / 2 - sqrtD)
    return [u + v + offset]
  } else if (discriminant < -EPSILON) {
    // Three real roots (casus irreducibilis) — use trigonometric method
    const m = Math.sqrt(-p1 / 3)
    const theta = Math.acos((3 * q1) / (2 * p1 * m)) / 3
    const twoPiThird = (2 * Math.PI) / 3

    return [
      2 * m * Math.cos(theta) + offset,
      2 * m * Math.cos(theta - twoPiThird) + offset,
      2 * m * Math.cos(theta - 2 * twoPiThird) + offset,
    ]
  } else {
    // Repeated root
    if (Math.abs(q1) < EPSILON) {
      return [offset]
    }
    const u = Math.cbrt(-q1 / 2)
    return [2 * u + offset, -u + offset]
  }
}

/**
 * Solve ax^4 + bx^3 + cx^2 + dx + e = 0 using Ferrari's method.
 * Reduces to solving a resolvent cubic, then two quadratics.
 */
export function solveQuartic(a: number, b: number, c: number, d: number, e: number): number[] {
  if (Math.abs(a) < EPSILON) return solveCubic(b, c, d, e)

  // Normalize: x^4 + Bx^3 + Cx^2 + Dx + E = 0
  const B = b / a
  const C = c / a
  const D = d / a
  const E = e / a

  // Depressed quartic via substitution x = t - B/4
  // t^4 + pt^2 + qt + r = 0
  const B2 = B * B
  const B3 = B2 * B
  const B4 = B2 * B2

  const p = C - (3 * B2) / 8
  const q = D - (B * C) / 2 + B3 / 8
  const r = E - (B * D) / 4 + (B2 * C) / 16 - (3 * B4) / 256

  const offset = -B / 4

  // If q ≈ 0, the depressed quartic is a biquadratic: t^4 + pt^2 + r = 0
  if (Math.abs(q) < EPSILON) {
    const quadRoots = solveQuadratic(1, p, r)
    const roots: number[] = []
    for (const qr of quadRoots) {
      if (qr >= -EPSILON) {
        const sqrtQr = Math.sqrt(Math.max(0, qr))
        roots.push(sqrtQr + offset, -sqrtQr + offset)
      }
    }
    return roots
  }

  // Ferrari's resolvent cubic: 8m^3 + 8pm^2 + (2p^2 - 8r)m - q^2 = 0
  const cubicRoots = solveCubic(8, 8 * p, 2 * p * p - 8 * r, -(q * q))

  // Pick any real root m of the resolvent cubic (prefer the largest for numerical stability)
  let m = cubicRoots[0]
  for (let i = 1; i < cubicRoots.length; i++) {
    if (cubicRoots[i] > m) m = cubicRoots[i]
  }

  // Now factor into two quadratics:
  // (t^2 + sqrt(2m)*t + (p/2 + m - q/(2*sqrt(2m)))) = 0
  // (t^2 - sqrt(2m)*t + (p/2 + m + q/(2*sqrt(2m)))) = 0
  const sqrt2m = Math.sqrt(Math.max(0, 2 * m))

  if (sqrt2m < EPSILON) {
    // Degenerate case — fall back to biquadratic
    const quadRoots = solveQuadratic(1, p, r)
    const roots: number[] = []
    for (const qr of quadRoots) {
      if (qr >= -EPSILON) {
        const sqrtQr = Math.sqrt(Math.max(0, qr))
        roots.push(sqrtQr + offset, -sqrtQr + offset)
      }
    }
    return roots
  }

  const qOver2sqrt2m = q / (2 * sqrt2m)
  const halfP = p / 2 + m

  const roots1 = solveQuadratic(1, sqrt2m, halfP - qOver2sqrt2m)
  const roots2 = solveQuadratic(1, -sqrt2m, halfP + qOver2sqrt2m)

  const roots: number[] = []
  for (const root of roots1) roots.push(root + offset)
  for (const root of roots2) roots.push(root + offset)
  return roots
}
