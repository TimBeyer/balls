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

## Physics System

### Physics Profiles

Two swappable profiles bundle motion models, collision resolvers, and state determination:

- **Pool** (`createPoolPhysicsProfile`): 5 motion states (Stationary, Spinning, Rolling, Sliding, Airborne), Han 2005 cushion resolver, 4-state friction model
- **Simple 2D** (`createSimple2DProfile`): 2 motion states (Stationary, Rolling), simple cushion reflection, no friction

### Physics Config

Per-ball physics parameters (`BallPhysicsParams`):
- `mass`: 0.17 kg (pool), 100 kg (zero-friction tests)
- `radius`: 37.5 mm
- `muSliding`: 0.2, `muRolling`: 0.01, `muSpinning`: 0.044
- `eRestitution`: 0.85 (cushion), `eBallBall`: 0.93 (ball-ball)

Global config (`PhysicsConfig`): `gravity` = 9810 mm/s², `cushionHeight` = 10.1 mm

Three presets: `defaultPhysicsConfig` (pool), `zeroFrictionConfig` (ideal elastic, e=1.0, µ=0)

### Motion States

`Stationary` → `Spinning` → `Rolling` → `Sliding` → `Airborne`

Each state has a motion model that computes trajectory coefficients and transition times. State transitions are scheduled as events in the priority queue, just like collisions.

### Trajectory System

Position: `r(t) = a·t² + b·t + c` (polynomial relative to ball's reference time). Angular velocity: `ω(t) = α·t + ω₀`. Each trajectory has a `maxDt` validity horizon beyond which extrapolation is unphysical.

### Contact Cluster Solver

When a ball-ball collision fires, the solver:
1. **BFS discovery** — finds all balls within `CONTACT_TOL` (0.001 mm) via spatial grid
2. **Snap-apart** — iteratively resolves overlaps (5 passes)
3. **Constraint building** — creates constraints only for approaching pairs (vRelN < 0)
4. **Sequential impulse** (Gauss-Seidel) — iterates up to 20 times until convergence (0.01 mm/s threshold)
5. **Atomic application** — updates trajectories once for all affected balls

Key constants: `V_LOW` = 5 mm/s (below this, e=0 perfectly inelastic), `MAX_CLUSTER_SIZE` = 200.

Accumulated impulse clamping (≥ 0) guarantees convergence — impulses can only push balls apart.

### Pair Rate Limiter

Prevents Zeno cascades (infinite collisions in finite time) for ball pairs:
- **Tier 0** (≤ 30 collisions per 0.2s window): normal physics
- **Tier 1** (31–60): force fully inelastic
- **Tier 2** (> 60): suppress pair entirely until window resets

## Key Design Decisions

- **Absolute time per ball**: Each `Ball` tracks its own `time` field. `advanceTime(t)` evaluates the trajectory polynomial relative to that time, then updates it. This avoids cumulative floating-point drift.
- **Epoch-based lazy invalidation**: Instead of eagerly removing stale events from the heap, each `Ball` has an `epoch` counter. Events record the epoch at creation. Stale events (epoch mismatch) are skipped at O(1) cost in `pop()`.
- **Quartic collision detection**: With quadratic trajectories (friction), distance² between two balls is a degree-4 polynomial. The detector solves D'(t) = 0 (cubic via Cardano) for critical points, then bisects (40 iterations) to find exact zero crossings.
- **Overlap guard**: If balls already overlap (D(0) ≤ 0) and are separating, detection returns `undefined`. If approaching, it returns an immediate collision.
- **Boundary snapping**: On cushion collision, position is forced to `radius` from the wall to prevent floating-point escape.
- **Energy quiescence**: Balls with speed ≤ 2 mm/s snap directly to Stationary, skipping the Sliding→Rolling→Stationary chain. Eliminates thousands of events in dense clusters.
- **Spatial grid**: Broadphase optimization. 2D grid with 3×3 cell neighborhood lookup. Also predicts cell-crossing times via quadratic solve, scheduled as events.
- **Scenario physics mapping**: The worker maps `physics: 'zero-friction'` to Simple2D profile + zeroFrictionConfig, `'simple2d'` to Simple2D + default config, and `'pool'` to Pool profile + default config.

## Project Structure

```
src/
├── index.ts                              # Entry point, animation loop, worker management
├── benchmark.ts                          # Performance benchmarking
├── lib/
│   ├── ball.ts                           # Ball class: 3D position/velocity, trajectory, epoch, physicsParams
│   ├── circle.ts                         # Legacy Circle class (still used by some renderers)
│   ├── collision.ts                      # CollisionFinder: MinHeap priority queue, spatial grid integration
│   ├── simulation.ts                     # simulate() — core event loop, cluster solver integration
│   ├── simulation.worker.ts              # Web Worker: initialization, scenario loading, simulation
│   ├── config.ts                         # SimulationConfig interface + defaults
│   ├── physics-config.ts                 # BallPhysicsParams, PhysicsConfig, default/zeroFriction presets
│   ├── motion-state.ts                   # MotionState enum (Stationary, Spinning, Rolling, Sliding, Airborne)
│   ├── trajectory.ts                     # TrajectoryCoeffs (a·t²+b·t+c), evaluation functions
│   ├── spatial-grid.ts                   # SpatialGrid: broadphase, cell transitions
│   ├── min-heap.ts                       # Array-backed binary min-heap sorted by (time, seq)
│   ├── generate-circles.ts              # Non-overlapping circle generation (brute-force placement)
│   ├── scenarios.ts                      # 50+ test/demo scenarios (single ball, multi-ball, edge cases)
│   ├── polynomial-solver.ts             # Cubic/quartic algebraic solvers for collision detection
│   ├── vector2d.ts                       # Vector2D = [number, number]
│   ├── vector3d.ts                       # Vector3D = [number, number, number]
│   ├── string-to-rgb.ts                  # Deterministic ID → color mapping
│   ├── worker-request.ts                 # Worker request message types
│   ├── worker-response.ts                # Worker response message types
│   ├── ui.ts                             # Tweakpane UI controls
│   ├── physics/
│   │   ├── physics-profile.ts            # PhysicsProfile interface, Pool + Simple2D factories
│   │   ├── detection/
│   │   │   ├── collision-detector.ts     # Unified detector: dispatches to ball-ball and cushion
│   │   │   ├── ball-ball-detector.ts     # Quartic D(t) via Cardano + bisection
│   │   │   └── cushion-detector.ts       # Linear/quadratic cushion collision times
│   │   ├── collision/
│   │   │   ├── collision-resolver.ts     # Dispatcher: routes to ball/cushion resolvers
│   │   │   ├── contact-cluster-solver.ts # Simultaneous constraint solver (BFS + Gauss-Seidel)
│   │   │   ├── contact-resolver.ts       # Post-collision contact resolution (legacy, kept for simple2d)
│   │   │   ├── elastic-ball-resolver.ts  # Two-ball impulse resolver (used by simple2d profile)
│   │   │   ├── han2005-cushion-resolver.ts # Han 2005 cushion physics (spin effects, realistic angles)
│   │   │   └── simple-cushion-resolver.ts  # Simple reflection cushion resolver
│   │   └── motion/
│   │       ├── motion-model.ts           # MotionModel interface (getTrajectory, getTransitionTime)
│   │       ├── sliding-motion.ts         # Sliding: friction decelerates, computes rolling transition
│   │       ├── rolling-motion.ts         # Rolling: muRolling deceleration to stationary
│   │       ├── spinning-motion.ts        # Spinning: z-axis spin decay via muSpinning
│   │       ├── stationary-motion.ts      # Stationary: no motion, no transitions
│   │       └── airborne-motion.ts        # Airborne: ballistic trajectory with gravity
│   ├── debug/
│   │   ├── playback-controller.ts        # Pause, step, step-back, step-to-ball-event
│   │   ├── simulation-bridge.ts          # Connects debug UI to simulation state
│   │   └── ball-inspector.ts             # Per-ball state inspection
│   ├── renderers/
│   │   ├── renderer.ts                   # Base renderer class
│   │   ├── circle-renderer.ts            # Ball rendering with collision indicators
│   │   ├── tail-renderer.ts              # Motion trails
│   │   ├── future-trail-renderer.ts      # Predicted future paths
│   │   ├── collision-renderer.ts         # Next collision visualization
│   │   └── collision-preview-renderer.ts # Future collision previews
│   ├── scene/
│   │   └── simulation-scene.ts           # Three.js 3D scene, lights, camera
│   └── __tests__/                        # See Testing section
└── ui/
    ├── index.tsx                          # React UI entry point
    ├── components/
    │   ├── Sidebar.tsx                    # Main debug sidebar
    │   ├── BallInspectorPanel.tsx         # Per-ball inspector with "Next Ball Event" button
    │   ├── EventDetailPanel.tsx           # Collision event details (collapsible on mobile)
    │   ├── EventLog.tsx                   # Event history
    │   ├── DebugOverlay.tsx               # Debug overlay
    │   ├── DebugVisualizationPanel.tsx    # Debug visualization controls
    │   ├── OverlayTogglesPanel.tsx        # Renderer toggle controls
    │   ├── ScenarioPanel.tsx              # Scenario selection UI
    │   ├── SimulationStatsPanel.tsx       # Performance stats
    │   └── TransportBar.tsx              # Play/pause/step controls
    └── hooks/
        ├── use-simulation.ts             # Simulation state management hook
        └── use-keyboard-shortcuts.ts     # Keyboard shortcuts (Space, arrows, Shift+→)
```

## Testing

Tests are in `src/lib/__tests__/` using Vitest with globals enabled. Run with `npm test`.

**Test files:**
- `single-ball-motion.test.ts` — friction deceleration, sliding→rolling, spin decay, energy conservation
- `cushion-collision.test.ts` — head-on, angled, with spin, airborne, corner bounces
- `ball-ball-collision.test.ts` — velocity swap, mass ratios, glancing, spin preservation, inelastic threshold, energy conservation
- `multi-ball.test.ts` — Newton's cradle (3 & 5 ball), V-shape, triangle break, 4-ball convergence, 150-ball stress test
- `edge-cases.test.ts` — exactly-touching, at cushion, zero-velocity-z-spin, simultaneous collisions
- `invariants.test.ts` — no-overlap, monotonic time, momentum conservation, bounds enforcement
- `collision.test.ts` — collision detection unit tests
- `circle.test.ts` — Circle/Ball class unit tests
- `spatial-grid.test.ts` — spatial grid unit tests
- `polynomial-solver.test.ts` — cubic/quartic solver accuracy
- `perf-150.test.ts`, `perf-quick.test.ts`, `perf-compare.test.ts` — performance benchmarks
- `fuzz.test.ts` — randomized stress testing

**Test helpers:** `test-helpers.ts` provides ball factories, `runScenario()`, and assertion helpers (`assertNoOverlaps`, `assertInBounds`, `assertMonotonicTime`).

## Known Gotchas

- **Stale event accumulation**: Epoch-based invalidation leaves stale events in the min-heap until popped. Heap size is proportional to total events created, not just active predictions. Not a memory leak — each stale event is popped exactly once.
- **O(n) recomputation**: `CollisionFinder.recompute()` tests the affected ball against ALL spatial grid neighbors. Scales as O(k·n) per collision event where k = involved balls. Becomes a bottleneck at 500+ balls.
- **Quartic detector precision**: The ball-ball detector can miss collisions in rare trajectories, allowing ~0.5–0.7mm inter-event overlaps. This is a detection-level limitation exposed by different energy distributions. The diagnostic threshold in tests is 0.75mm.
- **CONTACT_TOL must cover scenario gaps**: Newton's cradle and other chain scenarios use tiny gaps (0.5μm) between balls. `CONTACT_TOL` (0.001mm) must be larger than these gaps so the cluster solver discovers the full chain via BFS.
- **Angular velocity preserved through collisions**: The cluster solver modifies linear velocity but not angular velocity. After collision, retained spin causes friction to accelerate/decelerate the ball (follow-through effect). This is physically correct for pool but means Newton's cradle only works properly with zero-friction physics.
- **Ball radius from config**: Ball radius comes from `physicsConfig.defaultBallParams.radius` (37.5mm), not separately configurable per scenario.

## Keyboard Shortcuts

- **Space** — pause/resume
- **→** — step to next event (when paused)
- **←** — step back (when paused)
- **Shift+→** — step to next event for selected ball (when paused, ball inspector open)
