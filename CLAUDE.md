# CLAUDE.md

## Project Overview

Analytical event-driven billiards collision simulation with 3D (Three.js) and 2D (Canvas) rendering.

**This is NOT a real-time delta-driven simulation.** Collision times are computed exactly using closed-form equations (quartic for ball-ball with quadratic trajectories, quadratic for ball-cushion). Events are processed in strict chronological order from a priority queue. The rendering layer plays back pre-computed results — simulation and visualization are fully decoupled.

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
  Load scenarios                       ← LOAD_SCENARIO
  simulate() loop                      ← REQUEST_SIMULATION_DATA
  CollisionFinder (MinHeap)
  ContactClusterSolver
  Stream ReplayData[] ──────────────→  Buffer events (PRECALC = 10s ahead)
                                       requestAnimationFrame loop
                                       PlaybackController (pause/step/rewind)
                                       Apply events at correct time
                                       positionAtTime(t) interpolation
                                       Three.js 3D scene + Canvas 2D overlay
                                       React debug UI (sidebar, inspector)
```

1. **Worker** generates non-overlapping circles (or loads a scenario), runs `simulate()`, streams `ReplayData[]` back
2. **Main thread** buffers events, plays back via `requestAnimationFrame`, requests more data when buffer drops below 10 seconds
3. **Between events**, ball positions are computed via polynomial trajectory evaluation — this is exact (quadratic motion between events), not an approximation

## Key Design Decisions

- **Absolute time per ball**: Each `Ball` tracks its own `time` field. `advanceTime(t)` evaluates the trajectory polynomial relative to that time, then updates it. This avoids cumulative floating-point drift.
- **Epoch-based lazy invalidation**: Instead of eagerly removing stale events from the heap, each `Ball` has an `epoch` counter. Events record the epoch at creation. Stale events (epoch mismatch) are skipped at O(1) cost in `pop()`.
- **Quartic collision detection**: With quadratic trajectories (friction), distance² between two balls is a degree-4 polynomial. The detector solves D'(t) = 0 (cubic via Cardano) for critical points, then bisects (40 iterations) to find exact zero crossings.
- **Overlap guard**: If balls already overlap (D(0) ≤ 0) and are separating, detection returns `undefined`. If approaching, it returns an immediate collision.
- **Boundary snapping**: On cushion collision, position is forced to `radius` from the wall to prevent floating-point escape.
- **Energy quiescence**: Balls with speed ≤ 2 mm/s snap directly to Stationary, skipping the Sliding→Rolling→Stationary chain. Eliminates thousands of events in dense clusters.
- **Spatial grid**: Broadphase optimization. 2D grid with 3×3 cell neighborhood lookup. Also predicts cell-crossing times via quadratic solve, scheduled as events.
- **Scenario physics mapping**: The worker maps `physics: 'zero-friction'` to Simple2D profile + zeroFrictionConfig, `'simple2d'` to Simple2D + default config, and `'pool'` to Pool profile + default config.

## Known Gotchas

- **Stale event accumulation**: Epoch-based invalidation leaves stale events in the min-heap until popped. Heap size is proportional to total events created, not just active predictions. Not a memory leak — each stale event is popped exactly once.
- **O(n) recomputation**: `CollisionFinder.recompute()` tests the affected ball against ALL spatial grid neighbors. Scales as O(k·n) per collision event where k = involved balls. Becomes a bottleneck at 500+ balls.
- **Quartic detector precision**: The ball-ball detector can miss collisions in rare trajectories, allowing ~0.5–0.7mm inter-event overlaps. This is a detection-level limitation exposed by different energy distributions. The diagnostic threshold in tests is 0.75mm.
- **CONTACT_TOL must cover scenario gaps**: Newton's cradle and other chain scenarios use tiny gaps (0.5μm) between balls. `CONTACT_TOL` (0.001mm) must be larger than these gaps so the cluster solver discovers the full chain via BFS.
- **Angular velocity preserved through collisions**: The cluster solver modifies linear velocity but not angular velocity. After collision, retained spin causes friction to accelerate/decelerate the ball (follow-through effect). This is physically correct for pool but means Newton's cradle only works properly with zero-friction physics.
- **Ball radius from config**: Ball radius comes from `physicsConfig.defaultBallParams.radius` (37.5mm), not separately configurable per scenario.
