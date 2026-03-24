# CLAUDE.md

## Project Overview

Analytical event-driven billiards collision simulation with 3D (Three.js) and 2D (Canvas) rendering.

**This is NOT a real-time delta-driven simulation.** Collision times are computed exactly using closed-form equations (quadratic formula for circle-circle, linear for circle-cushion). Events are processed in strict chronological order from a priority queue. The rendering layer plays back pre-computed results — simulation and visualization are fully decoupled.

## Commands

```sh
npm run dev          # Vite dev server with HMR
npm run build        # Production build → dist/
npm run preview      # Preview production build locally
npm test             # Run tests (Vitest, single run)
npm run test:watch   # Run tests in watch mode
npm run lint         # ESLint check
npm run format       # Prettier (write mode)
```

Deployment: Cloudflare Workers via `wrangler.jsonc`.

## Code Style

- TypeScript strict mode, ES2022 target
- No semicolons, single quotes, trailing commas, 120 char line width (`.prettierrc`)
- ESLint: recommended + typescript-eslint + prettier override
- `noUnusedParameters` and `noUnusedLocals` enabled in `tsconfig.json`
- `Vector2D` is a `[number, number]` tuple — mutations via index assignment, not methods
- Worker messages use discriminated unions with enum type fields and type guard functions

## Architecture

```
[Web Worker]                         [Main Thread]
  Generate circles (brute-force)       ← INITIALIZE_SIMULATION
  simulate() loop                      ← REQUEST_SIMULATION_DATA
  CollisionFinder (RBTree)
  Stream ReplayData[] ──────────────→  Buffer events (PRECALC = 10s ahead)
                                       requestAnimationFrame loop
                                       Apply events at correct time
                                       positionAtTime(t) interpolation
                                       Three.js 3D scene + Canvas 2D overlay
                                       Tweakpane UI controls
```

1. **Worker** generates non-overlapping circles, runs `simulate()`, streams `ReplayData[]` back
2. **Main thread** buffers events, plays back via `requestAnimationFrame`, requests more data when buffer drops below 10 seconds
3. **Between events**, circle positions are computed via `positionAtTime(t)` — this is exact (constant velocity between collisions), not an approximation

## Key Design Decisions

- **Absolute time per circle**: Each `Circle` tracks its own `time` field. `advanceTime(t)` computes position relative to that time, then updates it. This avoids cumulative floating-point drift. See `circle.ts:advanceTime()` and `simulation.ts` lines 55-58.
- **Boundary snapping**: On cushion collision, position is forced to `radius` from the wall to prevent floating-point escape (`simulation.ts` lines 72-87).
- **Relative-frame collision detection**: Circle-circle detection treats one circle as stationary, uses relative position/velocity to solve the quadratic. Both circles are projected to the same reference time first (`collision.ts` lines 86-89).
- **Overlap guard**: If circles already overlap (`distance < r1 + r2`), collision detection returns `undefined` to prevent re-detecting the same collision (`collision.ts` line 111).
- **RBTree priority queue**: Collisions are stored in a Red-Black Tree sorted by `(time, seq)`. The `seq` tiebreaker is critical — `bintrees` RBTree silently drops inserts when the comparator returns 0, so every event must have a unique key.
- **Epoch-based lazy invalidation**: Instead of eagerly removing stale events from the tree (old `RelationStore` approach), each `Circle` has an `epoch` counter. Events record the epoch of each involved circle at creation time. When a collision fires, involved circles' epochs are incremented. Stale events (epoch mismatch) are skipped in `pop()` at O(1) cost, avoiding O(k log n) tree removals per collision.

## Project Structure

```
src/
├── index.ts                         # Entry point, animation loop, worker management
├── benchmark.ts                     # Performance benchmarking (not wired to npm scripts)
└── lib/
    ├── circle.ts                    # Circle class with absolute time tracking and epoch counter
    ├── collision.ts                 # CollisionFinder, getCushionCollision, getCircleCollisionTime
    ├── simulation.ts                # simulate() — core event-driven engine
    ├── simulation.worker.ts         # Web Worker: circle generation + simulation
    ├── config.ts                    # SimulationConfig interface + defaults
    ├── ui.ts                        # Tweakpane UI controls
    ├── vector2d.ts                  # Vector2D = [number, number]
    ├── string-to-rgb.ts             # Deterministic ID → color mapping
    ├── worker-request.ts            # Worker request message types
    ├── worker-response.ts           # Worker response message types
    ├── renderers/
    │   ├── renderer.ts              # Base renderer class
    │   ├── circle-renderer.ts       # Ball circles with collision indicators
    │   ├── tail-renderer.ts         # Motion trails
    │   ├── collision-renderer.ts    # Next collision visualization
    │   └── collision-preview-renderer.ts  # Future collision previews
    ├── scene/
    │   └── simulation-scene.ts      # Three.js 3D scene, lights, camera
    └── __tests__/
        ├── circle.test.ts           # Circle class unit tests
        ├── collision.test.ts        # Collision detection unit tests
        ├── simulation.test.ts       # Simulation integration tests (overlap, bounds, correctness)
        └── spatial-grid.test.ts     # Spatial grid unit tests
```

## Testing

Tests are in `src/lib/__tests__/` using Vitest with globals enabled. Run with `npm test`.

Current coverage: `Circle` class (position, velocity, time advancement), collision detection (cushion collisions, circle-circle collision times), and simulation integration tests (velocity swap correctness, no-overlap invariant at collision events, table bounds enforcement, monotonic time, 150-circle stress test).

## Known Gotchas

- **RBTree rejects duplicate keys**: `bintrees` RBTree silently drops inserts when the comparator returns 0. Every `TreeEvent` must have a unique `seq` field used as a tiebreaker in the comparator (`a.time - b.time || a.seq - b.seq`). Without this, events with identical times (common: `recompute(A)` and `recompute(B)` both predict A-B collision with the same time since the quadratic is symmetric) are silently lost, causing balls to tunnel through each other.
- **Stale event accumulation**: Epoch-based invalidation leaves stale events in the RBTree until they are naturally popped. The tree is larger than with eager removal, but stale events drain at the rate they are created (each is popped exactly once). Not a memory leak, but the tree size at any instant is proportional to total events created since the last drain, not just active predictions.
- **O(n) recomputation**: `CollisionFinder.recompute()` tests the affected circle against ALL spatial grid neighbors. Scales as O(k*n) per collision event where k = involved circles. Becomes a bottleneck at 500+ balls.
- **Hardcoded mass**: All balls have mass 100 (`circle.ts` default, `index.ts` line 114). The collision math supports different masses but the system never varies them.
- **Ball radius hardcoded**: 37.5mm in `simulation.worker.ts` line 16, not configurable via `SimulationConfig`.
