/**
 * Shared scenario definitions for both tests and visual simulation.
 *
 * Each scenario is a plain data object describing initial ball positions,
 * velocities, spins, table dimensions, and physics profile. These are consumed
 * by test helpers (runScenario) and the visual simulation (LOAD_SCENARIO worker message).
 */

export interface BallSpec {
  id?: string
  x: number
  y: number
  vx?: number
  vy?: number
  vz?: number
  spin?: [number, number, number] // [wx, wy, wz] rad/s
}

export interface Scenario {
  name: string
  description: string
  table: { width: number; height: number }
  balls: BallSpec[]
  physics: 'pool' | 'simple2d' | 'zero-friction'
  duration: number // recommended simulation time in seconds
  /** Table type for pocket support. 'sandbox' or omitted = no pockets (existing behavior). */
  tableType?: 'pool' | 'snooker' | 'sandbox'
}

// ─── Standard table dimensions ───────────────────────────────────────────────

const POOL_TABLE = { width: 2540, height: 1270 }
const BALL_R = 37.5
const BALL_D = BALL_R * 2

// ─── Helpers for building scenarios ──────────────────────────────────────────

/** Build a triangle rack of touching balls (rows 1,2,3,...,n) */
function triangleRack(
  cx: number,
  cy: number,
  rows: number,
  idPrefix = 'rack',
): BallSpec[] {
  const d = BALL_D + 0.01 // tiny gap to avoid overlap guard
  const rowSpacing = d * Math.cos(Math.PI / 6) // √3/2 * d
  const balls: BallSpec[] = []
  let id = 1
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= row; col++) {
      balls.push({
        id: `${idPrefix}-${id++}`,
        x: cx + row * rowSpacing,
        y: cy + (col - row / 2) * d,
      })
    }
  }
  return balls
}

/** Build a line of nearly-touching balls along the x-axis (tiny gap to avoid overlap guard) */
function lineOfBalls(
  startX: number,
  y: number,
  count: number,
  idPrefix = 'line',
): BallSpec[] {
  const d = BALL_D + 0.0005 // 0.5μm gap — within CONTACT_TOL so cluster solver discovers the full chain
  return Array.from({ length: count }, (_, i) => ({
    id: `${idPrefix}-${i + 1}`,
    x: startX + i * d,
    y,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE BALL SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

export const singleBallScenarios: Scenario[] = [
  {
    name: 'stationary-ball',
    description: 'A ball at rest — should remain stationary',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 1270, y: 635 }],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'constant-velocity',
    description: 'Ball moving at constant velocity with zero friction',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 500, y: 635, vx: 200, vy: 0 }],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'sliding-deceleration',
    description: 'Ball sliding — friction decelerates it',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 500, y: 635, vx: 1000, vy: 0 }],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'sliding-to-rolling',
    description: 'Ball starts sliding, friction aligns spin to rolling constraint',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 500, y: 635, vx: 500, vy: 0 }],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'rolling-to-stationary',
    description: 'Ball in rolling state decelerates to stop',
    table: POOL_TABLE,
    // Start with rolling constraint satisfied: ωx = -vy/R, ωy = vx/R
    balls: [{ id: 'ball', x: 500, y: 635, vx: 200, vy: 0, spin: [0, 200 / BALL_R, 0] }],
    physics: 'pool',
    duration: 30,
  },
  {
    name: 'rolling-to-spinning-to-stationary',
    description: 'Ball with sidespin: forward stops, z-spin persists, then stops',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 500, y: 635, vx: 200, vy: 0, spin: [0, 200 / BALL_R, 50] }],
    physics: 'pool',
    duration: 60,
  },
  {
    name: 'spinning-to-stationary',
    description: 'Ball with only z-spin, no linear velocity',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 1270, y: 635, spin: [0, 0, 30] }],
    physics: 'pool',
    duration: 30,
  },
  {
    name: 'pure-backspin',
    description: 'Ball moving forward with strong backspin',
    table: POOL_TABLE,
    // Backspin: ωy negative (opposes forward vx motion)
    balls: [{ id: 'ball', x: 500, y: 635, vx: 300, vy: 0, spin: [0, -300 / BALL_R, 0] }],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'pure-topspin',
    description: 'Ball moving forward with extra topspin',
    table: POOL_TABLE,
    // Topspin: spin exceeds rolling constraint (double the rolling ωy)
    balls: [{ id: 'ball', x: 500, y: 635, vx: 300, vy: 0, spin: [0, (2 * 300) / BALL_R, 0] }],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'sliding-diagonal',
    description: 'Ball sliding diagonally — tests 2D rolling constraint enforcement',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 500, y: 400, vx: 500, vy: 300 }],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'multiple-balls-to-rest',
    description: 'Several balls with various velocities all come to rest',
    table: POOL_TABLE,
    balls: [
      { id: 'a', x: 400, y: 400, vx: 800, vy: 200 },
      { id: 'b', x: 1200, y: 800, vx: -500, vy: 300 },
      { id: 'c', x: 2000, y: 600, vx: 100, vy: -700 },
    ],
    physics: 'pool',
    duration: 60,
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// CUSHION COLLISION SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

export const cushionScenarios: Scenario[] = [
  {
    name: 'cushion-head-on-east',
    description: 'Ball heading straight into east cushion',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: POOL_TABLE.width / 2, y: 635, vx: 1000, vy: 0 }],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'cushion-head-on-north',
    description: 'Ball heading straight into north cushion',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 1270, y: POOL_TABLE.height / 2, vx: 0, vy: 1000 }],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'cushion-angled-45',
    description: 'Ball hitting east cushion at 45 degrees',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: POOL_TABLE.width / 2, y: 100, vx: 1000, vy: 500 }],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'cushion-with-sidespin',
    description: 'Ball hitting cushion with z-spin (throws angle)',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: POOL_TABLE.width / 2, y: 635, vx: 1000, vy: 0, spin: [0, 0, 80] }],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'cushion-with-topspin',
    description: 'Ball hitting cushion with forward spin',
    table: POOL_TABLE,
    balls: [
      { id: 'ball', x: POOL_TABLE.width / 2, y: 635, vx: 1000, vy: 0, spin: [0, 1000 / BALL_R, 0] },
    ],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'cushion-with-backspin',
    description: 'Ball hitting cushion with backspin — should bounce back with reduced speed',
    table: POOL_TABLE,
    balls: [
      { id: 'ball', x: POOL_TABLE.width / 2, y: 635, vx: 2000, vy: 0, spin: [0, -2000 / BALL_R, 0] },
    ],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'cushion-airborne',
    description: 'Fast ball hits cushion and goes airborne (Han 2005)',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: POOL_TABLE.width / 2, y: 635, vx: 2000, vy: 0 }],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'cushion-corner-bounce',
    description: 'Ball near corner hits two walls in sequence',
    table: POOL_TABLE,
    balls: [
      {
        id: 'ball',
        x: POOL_TABLE.width - BALL_R - 300,
        y: POOL_TABLE.height - BALL_R - 300,
        vx: 1000,
        vy: 1000,
      },
    ],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'cushion-shallow-angle',
    description: 'Ball rolling nearly parallel to cushion',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: POOL_TABLE.width - BALL_R - 200, y: 300, vx: 50, vy: 1000 }],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'airborne-landing',
    description: 'Ball with upward velocity lands and settles',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 1270, y: 635, vx: 500, vy: 0, vz: 25 }],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'cushion-head-on-south',
    description: 'Ball heading straight into south cushion',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 1270, y: POOL_TABLE.height / 2, vx: 0, vy: -1000 }],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'cushion-head-on-west',
    description: 'Ball heading straight into west cushion',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: POOL_TABLE.width / 2, y: 635, vx: -1000, vy: 0 }],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'airborne-low-vz',
    description: 'Ball with low upward velocity — should settle without bouncing',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 1270, y: 635, vx: 500, vy: 0, vz: 5 }],
    physics: 'pool',
    duration: 10,
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// TWO-BALL COLLISION SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

export const twoBallScenarios: Scenario[] = [
  {
    name: 'head-on-equal-mass',
    description: 'Two equal-mass balls head-on — velocities swap (zero friction)',
    table: POOL_TABLE,
    balls: [
      { id: 'a', x: 500, y: 635, vx: 500, vy: 0 },
      { id: 'b', x: 800, y: 635, vx: -500, vy: 0 },
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'moving-hits-stationary',
    description: 'Moving ball hits stationary — moving stops, stationary moves',
    table: POOL_TABLE,
    balls: [
      { id: 'cue', x: 500, y: 635, vx: 800, vy: 0 },
      { id: 'target', x: 500 + BALL_D + 100, y: 635 },
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'head-on-different-mass',
    description: 'Head-on collision with different masses',
    table: { width: 2000, height: 1000 },
    balls: [
      { id: 'heavy', x: 500, y: 500, vx: 300, vy: 0 },
      { id: 'light', x: 900, y: 500, vx: -300, vy: 0 },
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'glancing-90-degree',
    description: 'Offset collision — equal mass deflection at ~90°',
    table: POOL_TABLE,
    balls: [
      { id: 'cue', x: 500, y: 635, vx: 800, vy: 0 },
      { id: 'target', x: 500 + BALL_D + 100, y: 635 + BALL_R }, // offset by half a radius
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'angled-both-moving',
    description: 'Two balls approaching at an angle, both moving',
    table: POOL_TABLE,
    balls: [
      { id: 'a', x: 500, y: 600, vx: 500, vy: 100 },
      { id: 'b', x: 800, y: 650, vx: -500, vy: -100 },
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'collision-preserves-spin',
    description: 'Spinning ball hits target — spin preserved on striker, not transferred',
    table: POOL_TABLE,
    balls: [
      { id: 'spinner', x: 500, y: 635, vx: 800, vy: 0, spin: [0, 0, 50] },
      { id: 'target', x: 500 + BALL_D + 100, y: 635 },
    ],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'low-energy-inelastic',
    description: 'Approach speed below 5 mm/s threshold — perfectly inelastic',
    table: POOL_TABLE,
    balls: [
      { id: 'a', x: 500, y: 635, vx: 2, vy: 0 },
      { id: 'b', x: 500 + BALL_D + 10, y: 635, vx: -2, vy: 0 },
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'at-threshold-speed',
    description: 'Approach speed exactly at 5 mm/s inelastic threshold',
    table: POOL_TABLE,
    balls: [
      { id: 'a', x: 500, y: 635, vx: 2.5, vy: 0 },
      { id: 'b', x: 500 + BALL_D + 10, y: 635, vx: -2.5, vy: 0 },
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'just-above-threshold',
    description: 'Approach speed just above 5 mm/s — normal elastic collision',
    table: POOL_TABLE,
    balls: [
      { id: 'a', x: 500, y: 635, vx: 3, vy: 0 },
      { id: 'b', x: 500 + BALL_D + 10, y: 635, vx: -3, vy: 0 },
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'momentum-conservation-pool',
    description: 'Verify momentum conservation with pool physics friction',
    table: POOL_TABLE,
    balls: [
      { id: 'cue', x: 500, y: 635, vx: 1000, vy: 0 },
      { id: 'target', x: 500 + BALL_D + 50, y: 635 },
    ],
    physics: 'pool',
    duration: 10,
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-BALL SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

export const multiBallScenarios: Scenario[] = [
  {
    name: 'newtons-cradle-3',
    description: "Newton's cradle with 3 balls in a line",
    table: POOL_TABLE,
    balls: [
      { id: 'striker', x: 500, y: 635, vx: 800, vy: 0 },
      ...lineOfBalls(500 + BALL_D + 100, 635, 2, 'cradle'),
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'newtons-cradle-5',
    description: "Newton's cradle with 5 balls in a line",
    table: POOL_TABLE,
    balls: [
      { id: 'striker', x: 400, y: 635, vx: 800, vy: 0 },
      ...lineOfBalls(400 + BALL_D + 100, 635, 4, 'cradle'),
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'v-shape-hit',
    description: 'Ball hits two touching balls arranged in a V',
    table: POOL_TABLE,
    balls: [
      { id: 'cue', x: 800, y: 635, vx: 1000, vy: 0 },
      { id: 'left', x: 800 + BALL_D + 100, y: 635 - BALL_R - 0.01 },
      { id: 'right', x: 800 + BALL_D + 100, y: 635 + BALL_R + 0.01 },
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'triangle-cluster-struck',
    description: '3-ball touching triangle, cue hits apex',
    table: POOL_TABLE,
    balls: [
      { id: 'cue', x: 800, y: 635, vx: 1000, vy: 0 },
      ...triangleRack(800 + BALL_D + 100, 635, 2, 'tri'),
    ],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'triangle-break-15',
    description: 'Standard 15-ball triangle rack break',
    table: POOL_TABLE,
    balls: [
      { id: 'cue', x: POOL_TABLE.width * 0.25, y: POOL_TABLE.height / 2, vx: 3000, vy: 50 },
      ...triangleRack(POOL_TABLE.width * 0.7, POOL_TABLE.height / 2, 5, 'rack'),
    ],
    physics: 'pool',
    duration: 30,
  },
  {
    name: 'break-22-with-spin',
    description: 'Full 22-ball break with cue spin — stress test',
    table: POOL_TABLE,
    balls: [
      {
        id: 'cue',
        x: POOL_TABLE.width * 0.25,
        y: POOL_TABLE.height / 2,
        vx: 3000,
        vy: 50,
        vz: 15,
        spin: [10, -5, 50],
      },
      ...triangleRack(POOL_TABLE.width * 0.7, POOL_TABLE.height / 2, 5, 'rack').map((b) => ({
        ...b,
        spin: [0, 0, 5] as [number, number, number],
      })),
      // Extra scattered balls
      { id: 'extra-1', x: 400, y: 300, spin: [0, 0, 5] as [number, number, number] },
      { id: 'extra-2', x: 600, y: 900, spin: [0, 0, 5] as [number, number, number] },
      { id: 'extra-3', x: 1800, y: 300, spin: [0, 0, 5] as [number, number, number] },
      { id: 'extra-4', x: 2000, y: 900, spin: [0, 0, 5] as [number, number, number] },
      { id: 'extra-5', x: 1000, y: 200, spin: [0, 0, 5] as [number, number, number] },
      { id: 'extra-6', x: 1500, y: 1000, spin: [0, 0, 5] as [number, number, number] },
    ],
    physics: 'pool',
    duration: 30,
  },
  {
    name: 'converging-4-balls',
    description: '4 balls converging on center from cardinal directions',
    table: POOL_TABLE,
    balls: [
      { id: 'north', x: 1270, y: 900, vx: 0, vy: -500 },
      { id: 'south', x: 1270, y: 370, vx: 0, vy: 500 },
      { id: 'east', x: 1535, y: 635, vx: -500, vy: 0 },
      { id: 'west', x: 1005, y: 635, vx: 500, vy: 0 },
    ],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'low-energy-cluster',
    description: '5 nearly stationary balls close together — tests inelastic threshold',
    table: POOL_TABLE,
    balls: [
      { id: 'a', x: 1200, y: 635, vx: 3, vy: 1 },
      { id: 'b', x: 1200 + BALL_D + 5, y: 635, vx: -2, vy: 0 },
      { id: 'c', x: 1200 + BALL_D * 2 + 10, y: 635, vx: 1, vy: -1 },
      { id: 'd', x: 1200 + BALL_D + 5, y: 635 + BALL_D + 5, vx: 0, vy: -2 },
      { id: 'e', x: 1200 + BALL_D + 5, y: 635 - BALL_D - 5, vx: -1, vy: 2 },
    ],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'grid-15-random',
    description: '15 balls in a grid with varied velocities',
    table: POOL_TABLE,
    balls: Array.from({ length: 15 }, (_, i) => {
      const row = Math.floor(i / 5)
      const col = i % 5
      return {
        id: `grid-${i}`,
        x: 300 + col * 200,
        y: 300 + row * 200,
        vx: (col - 2) * 200,
        vy: (row - 1) * 200,
      }
    }),
    physics: 'pool',
    duration: 20,
  },
  {
    name: 'stress-150',
    description: '150 balls — large-scale invariant verification',
    table: { width: 2840, height: 1420 },
    // This scenario uses random generation internally (too many balls to spec by hand)
    balls: [], // empty signals test helper to use generateCircles
    physics: 'pool',
    duration: 20,
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASE SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

export const edgeCaseScenarios: Scenario[] = [
  {
    name: 'exactly-touching',
    description: 'Two balls placed exactly at touching distance — no collision should fire',
    table: POOL_TABLE,
    balls: [
      { id: 'a', x: 1270, y: 635 },
      { id: 'b', x: 1270 + BALL_D, y: 635 },
    ],
    physics: 'zero-friction',
    duration: 1,
  },
  {
    name: 'ball-at-cushion',
    description: 'Ball placed exactly at cushion boundary moving away — should not get stuck',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: BALL_R, y: 635, vx: 500, vy: 0 }],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'zero-velocity-z-spin',
    description: 'Ball with no linear velocity but z-spin — Spinning state',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 1270, y: 635, spin: [0, 0, 30] }],
    physics: 'pool',
    duration: 30,
  },
  {
    name: 'very-high-velocity',
    description: 'Ball at 10,000 mm/s — numerical stability test',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 1270, y: 635, vx: 10000, vy: 3000 }],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'very-low-velocity',
    description: 'Ball at 1 mm/s — should transition to Stationary cleanly',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 1270, y: 635, vx: 1, vy: 0 }],
    physics: 'pool',
    duration: 5,
  },
  {
    name: 'simultaneous-collisions',
    description: 'Two pairs at exact same distance — simultaneous collision times',
    table: POOL_TABLE,
    balls: [
      { id: 'a1', x: 500, y: 400, vx: 500, vy: 0 },
      { id: 'a2', x: 800, y: 400, vx: -500, vy: 0 },
      { id: 'b1', x: 500, y: 800, vx: 500, vy: 0 },
      { id: 'b2', x: 800, y: 800, vx: -500, vy: 0 },
    ],
    physics: 'zero-friction',
    duration: 5,
  },
  {
    name: 'pure-lateral-spin',
    description: 'Ball with wx/wy spin but no wz — enters Sliding, transitions to Rolling',
    table: POOL_TABLE,
    balls: [{ id: 'ball', x: 500, y: 635, vx: 500, vy: 0, spin: [10, -20, 0] }],
    physics: 'pool',
    duration: 10,
  },
  {
    name: 'near-simultaneous-3-ball',
    description: 'Three balls colliding nearly simultaneously',
    table: POOL_TABLE,
    balls: [
      { id: 'left', x: 600, y: 635, vx: 600, vy: 0 },
      { id: 'center', x: 900, y: 635 },
      { id: 'right', x: 1200, y: 635, vx: -600, vy: 0 },
    ],
    physics: 'zero-friction',
    duration: 5,
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED
// ═══════════════════════════════════════════════════════════════════════════════

export const allScenarios: Scenario[] = [
  ...singleBallScenarios,
  ...cushionScenarios,
  ...twoBallScenarios,
  ...multiBallScenarios,
  ...edgeCaseScenarios,
]

/** Look up a scenario by name */
export function findScenario(name: string): Scenario | undefined {
  return allScenarios.find((s) => s.name === name)
}
