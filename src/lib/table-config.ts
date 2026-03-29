/**
 * Table geometry configuration with pocket support.
 *
 * Defines pocket positions and cushion segments (walls with gaps at pocket mouths).
 * Used by the segmented cushion detector and pocket detector to handle
 * tables with pockets (pool, snooker) vs sandbox tables (no pockets).
 */

import type Vector2D from './vector2d'

export interface PocketDef {
  id: string // e.g. 'top-left', 'bottom-center'
  center: Vector2D // position in mm
  radius: number // acceptance radius — ball center must enter this circle to be pocketed
  mouthWidth: number // gap in cushion rail in mm
}

export interface CushionSegment {
  axis: 'x' | 'y' // which axis the wall is perpendicular to
  value: number // wall position along that axis (e.g. tableWidth for East wall)
  start: number // segment start along the parallel axis
  end: number // segment end along the parallel axis
  /** Which cushion direction this segment represents (for collision resolution) */
  direction: 'north' | 'east' | 'south' | 'west'
}

export interface TableConfig {
  width: number // mm
  height: number // mm
  pockets: PocketDef[]
  cushionSegments: CushionSegment[]
}

/**
 * Build cushion segments from table dimensions and pocket definitions.
 * Each wall is split into segments with gaps at pocket mouths.
 */
function buildCushionSegments(
  width: number,
  height: number,
  pockets: PocketDef[],
): CushionSegment[] {
  const segments: CushionSegment[] = []

  // Helper: given a wall definition and pockets on that wall,
  // produce segments with gaps cut out at pocket mouth positions.
  function splitWall(
    axis: 'x' | 'y',
    value: number,
    start: number,
    end: number,
    direction: CushionSegment['direction'],
    wallPockets: { center: number; halfMouth: number }[],
  ) {
    // Sort pockets by position along the wall
    const sorted = [...wallPockets].sort((a, b) => a.center - b.center)
    let cursor = start
    for (const p of sorted) {
      const gapStart = p.center - p.halfMouth
      const gapEnd = p.center + p.halfMouth
      if (gapStart > cursor) {
        segments.push({ axis, value, start: cursor, end: gapStart, direction })
      }
      cursor = gapEnd
    }
    if (cursor < end) {
      segments.push({ axis, value, start: cursor, end, direction })
    }
  }

  // Categorize pockets by which wall(s) they're on
  // Corner pockets affect two walls; center pockets affect one wall
  const northPockets: { center: number; halfMouth: number }[] = []
  const southPockets: { center: number; halfMouth: number }[] = []
  const eastPockets: { center: number; halfMouth: number }[] = []
  const westPockets: { center: number; halfMouth: number }[] = []

  const cornerTol = 100 // mm — how close to a corner to be considered a corner pocket

  for (const p of pockets) {
    const halfMouth = p.mouthWidth / 2
    const nearLeft = p.center[0] < cornerTol
    const nearRight = p.center[0] > width - cornerTol
    const nearBottom = p.center[1] < cornerTol
    const nearTop = p.center[1] > height - cornerTol

    // Corner pockets cut into both adjacent walls
    if (nearTop || (!nearBottom && p.center[1] > height / 2 && Math.abs(p.center[1] - height) < cornerTol * 2)) {
      northPockets.push({ center: p.center[0], halfMouth })
    }
    if (nearBottom || (!nearTop && p.center[1] < height / 2 && Math.abs(p.center[1]) < cornerTol * 2)) {
      southPockets.push({ center: p.center[0], halfMouth })
    }
    if (nearRight || (!nearLeft && p.center[0] > width / 2 && Math.abs(p.center[0] - width) < cornerTol * 2)) {
      eastPockets.push({ center: p.center[1], halfMouth })
    }
    if (nearLeft || (!nearRight && p.center[0] < width / 2 && Math.abs(p.center[0]) < cornerTol * 2)) {
      westPockets.push({ center: p.center[1], halfMouth })
    }
  }

  // North wall: y = height, runs along x from 0 to width
  splitWall('y', height, 0, width, 'north', northPockets)
  // South wall: y = 0, runs along x from 0 to width
  splitWall('y', 0, 0, width, 'south', southPockets)
  // East wall: x = width, runs along y from 0 to height
  splitWall('x', width, 0, height, 'east', eastPockets)
  // West wall: x = 0, runs along y from 0 to height
  splitWall('x', 0, 0, height, 'west', westPockets)

  return segments
}

// ─── Standard table dimensions ──────────────────────────────────────────────

const POOL_WIDTH = 2540 // mm (regulation 9-foot table playing surface)
const POOL_HEIGHT = 1270

const SNOOKER_WIDTH = 3569 // mm (regulation 12-foot table)
const SNOOKER_HEIGHT = 1778

// ─── Pocket configurations ──────────────────────────────────────────────────

function sixPocketLayout(
  width: number,
  height: number,
  cornerRadius: number,
  centerRadius: number,
  cornerMouth: number,
  centerMouth: number,
): PocketDef[] {
  return [
    // Corner pockets
    { id: 'top-left', center: [0, height], radius: cornerRadius, mouthWidth: cornerMouth },
    { id: 'top-right', center: [width, height], radius: cornerRadius, mouthWidth: cornerMouth },
    { id: 'bottom-left', center: [0, 0], radius: cornerRadius, mouthWidth: cornerMouth },
    { id: 'bottom-right', center: [width, 0], radius: cornerRadius, mouthWidth: cornerMouth },
    // Center (side) pockets
    { id: 'top-center', center: [width / 2, height], radius: centerRadius, mouthWidth: centerMouth },
    { id: 'bottom-center', center: [width / 2, 0], radius: centerRadius, mouthWidth: centerMouth },
  ]
}

/**
 * Standard pool table (9-foot): 2540x1270mm, 6 pockets.
 * Corner pocket mouth ~115mm, center pocket mouth ~130mm.
 */
export function createPoolTable(): TableConfig {
  const pockets = sixPocketLayout(
    POOL_WIDTH,
    POOL_HEIGHT,
    65, // corner acceptance radius
    70, // center acceptance radius
    115, // corner mouth width
    130, // center mouth width
  )
  return {
    width: POOL_WIDTH,
    height: POOL_HEIGHT,
    pockets,
    cushionSegments: buildCushionSegments(POOL_WIDTH, POOL_HEIGHT, pockets),
  }
}

/**
 * Standard snooker table (12-foot): 3569x1778mm, 6 pockets.
 * Tighter pockets than pool: corner ~85mm mouth, center ~100mm mouth.
 */
export function createSnookerTable(): TableConfig {
  const pockets = sixPocketLayout(
    SNOOKER_WIDTH,
    SNOOKER_HEIGHT,
    45, // corner acceptance radius (tighter than pool)
    50, // center acceptance radius
    85, // corner mouth width
    100, // center mouth width
  )
  return {
    width: SNOOKER_WIDTH,
    height: SNOOKER_HEIGHT,
    pockets,
    cushionSegments: buildCushionSegments(SNOOKER_WIDTH, SNOOKER_HEIGHT, pockets),
  }
}

/**
 * Sandbox table with no pockets — continuous walls (existing behavior).
 */
export function createSandboxTable(width: number, height: number): TableConfig {
  return {
    width,
    height,
    pockets: [],
    cushionSegments: buildCushionSegments(width, height, []),
  }
}
