# Billiards

A billiards simulation where every collision is solved exactly — no physics engine, no timestep approximation, just the quadratic formula and a priority queue.

Balls move on a 3D-rendered table with reflective materials, soft shadows, and a 2D overlay that lets you peek into the future: see predicted collision points, motion trails, and the next impact before it happens. The entire simulation runs ahead of what you see on screen, pre-computed in a Web Worker and played back frame-perfect.

```sh
npm install
npm run dev
```

## What makes this different

Most collision simulations step forward in small time increments and check for overlaps. This one doesn't step at all. Instead:

1. **Every collision time is computed analytically** — circle-circle uses the quadratic formula on relative velocity, cushion collisions use linear equations
2. **Events are processed in exact chronological order** from a Red-Black Tree priority queue
3. **Between collisions, positions are exact** — `position + velocity × Δt`, no accumulation of floating-point error
4. **Simulation and rendering are fully decoupled** — a Web Worker solves physics ahead of time, the main thread just plays it back

The result is a simulation that doesn't drift, doesn't tunnel, and doesn't slow down to maintain accuracy.

## The visualization

The scene layers a **Three.js 3D view** with a **Canvas 2D overlay**:

<table>
<tr><td>

**3D layer**
- PBR materials with environment-mapped reflections
- Dual spotlights with PCF soft shadows
- Interactive camera (orbit, zoom, pan)
- Adjustable ball roughness and geometry detail

</td><td>

**2D overlay**
- Color-coded ball indicators
- Motion trails showing recent paths
- Next-collision marker with connecting line
- Future collision preview (up to 50 events ahead)

</td></tr>
</table>

Everything is tweakable at runtime through a [Tweakpane](https://tweakpane.github.io/docs/) control panel — ball count (1–500), table dimensions, simulation speed, shadow quality, lighting angles, overlay toggles, and more. Most changes take effect immediately; a few (ball count, table size) require a restart.

## Architecture

```
  Web Worker                              Main Thread
 ┌──────────────────────┐    events    ┌──────────────────────────┐
 │ Generate circles     │─────────────→│ Buffer (10s ahead)       │
 │ simulate() loop      │              │ requestAnimationFrame    │
 │ CollisionFinder      │←─────────────│ Request more when low    │
 │   (RBTree + epochs)  │   request    │ positionAtTime(t) interp │
 └──────────────────────┘              │ Three.js + Canvas render │
                                       │ Tweakpane UI             │
                                       └──────────────────────────┘
```

The worker streams `ReplayData[]` events to the main thread, which buffers 10 seconds of simulation ahead of the current playback time. When the buffer runs low, it requests more. Between collision events, ball positions are computed with simple linear interpolation — this is exact, not an approximation, because velocity is constant between collisions.

<details>
<summary><strong>Key implementation details</strong></summary>

- **Absolute time per circle** — each ball tracks its own `time` field. `advanceTime(t)` computes position relative to that time, avoiding cumulative drift across thousands of collisions.

- **Epoch-based lazy invalidation** — when a collision fires, involved balls increment their epoch counter. Stale predictions still sitting in the priority queue are skipped at O(1) cost when popped, avoiding expensive tree removals.

- **RBTree sequence tiebreaker** — the `bintrees` RBTree silently drops inserts when the comparator returns 0. Every event carries a unique `seq` field so `(time, seq)` is always unique. Without this, simultaneous collisions get silently lost and balls tunnel through each other.

- **Boundary snapping** — on cushion collision, position is forced to exactly `radius` from the wall. This prevents floating-point creep from gradually pushing balls outside the table.

- **Relative-frame detection** — circle-circle collision math treats one circle as stationary, solves the quadratic on relative position/velocity. Both circles are projected to the same reference time first.

</details>

## Project structure

```
src/
├── index.ts                 # Entry point, animation loop, worker comms
├── benchmark.ts             # Performance benchmarking (tinybench)
└── lib/
    ├── circle.ts            # Circle with absolute time + epoch tracking
    ├── collision.ts         # CollisionFinder, analytical collision math
    ├── simulation.ts        # Event-driven simulation engine
    ├── simulation.worker.ts # Web Worker: generation + simulation
    ├── config.ts            # SimulationConfig defaults
    ├── ui.ts                # Tweakpane control panel
    ├── vector2d.ts          # Vector2D = [number, number]
    ├── renderers/           # Canvas overlays (circles, tails, collisions)
    ├── scene/               # Three.js scene, lights, camera, materials
    └── __tests__/           # Vitest tests (circle, collision, simulation)
```

## Scripts

```sh
npm run dev          # Vite dev server with HMR
npm run build        # Production build → dist/
npm run preview      # Preview production build
npm test             # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
npm run lint         # ESLint
npm run format       # Prettier
npm run benchmark    # Performance benchmarks
```

## License

ISC
