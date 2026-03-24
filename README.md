# Billiards Collision Simulation

An analytical event-driven billiards simulation with 3D (Three.js) and 2D (Canvas) rendering.

Collision times are computed exactly using closed-form equations (quadratic formula for circle-circle, linear for circle-cushion). Events are processed in strict chronological order from a priority queue. The rendering layer plays back pre-computed results — simulation and visualization are fully decoupled.

## Getting Started

```sh
npm install
npm run dev
```

## Scripts

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `npm run dev`        | Vite dev server with HMR           |
| `npm run build`      | Production build to `dist/`        |
| `npm run preview`    | Preview production build locally   |
| `npm test`           | Run tests (Vitest, single run)     |
| `npm run test:watch` | Run tests in watch mode            |
| `npm run lint`       | ESLint check                       |
| `npm run format`     | Prettier (write mode)              |
| `npm run benchmark`  | Run performance benchmarks         |

## How It Works

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

1. A **Web Worker** generates non-overlapping circles and runs the simulation, streaming replay events back to the main thread
2. The **main thread** buffers events and plays them back via `requestAnimationFrame`, requesting more data when the buffer drops below 10 seconds
3. Between events, circle positions are computed via `positionAtTime(t)` — exact constant-velocity interpolation, not an approximation

### Key Design Decisions

- **Analytical collision detection**: Circle-circle collisions use the quadratic formula on relative velocity; cushion collisions use linear equations. No iterative or approximate methods.
- **Absolute time tracking**: Each circle tracks its own `time` field to avoid cumulative floating-point drift
- **Epoch-based lazy invalidation**: Stale collision events are skipped at O(1) cost via epoch counters, avoiding expensive tree removals
- **RBTree priority queue**: Collisions are sorted by `(time, seq)` with a sequence tiebreaker to prevent silent key collisions

## Project Structure

```
src/
├── index.ts                    # Entry point, animation loop, worker management
├── benchmark.ts                # Performance benchmarking
└── lib/
    ├── circle.ts               # Circle class with absolute time tracking
    ├── collision.ts            # CollisionFinder and collision math
    ├── simulation.ts           # Core event-driven simulation engine
    ├── simulation.worker.ts    # Web Worker for circle generation + simulation
    ├── config.ts               # SimulationConfig interface + defaults
    ├── ui.ts                   # Tweakpane UI controls
    ├── vector2d.ts             # Vector2D = [number, number] tuple
    ├── renderers/              # 2D Canvas renderers (circles, tails, collisions)
    ├── scene/                  # Three.js 3D scene setup
    └── __tests__/              # Vitest test suite
```

## Tech Stack

- **TypeScript** (strict mode, ES2022)
- **Three.js** for 3D WebGL rendering
- **Canvas API** for 2D overlay rendering
- **Web Workers** for off-thread simulation
- **Vite** for dev server and builds
- **Vitest** for testing
- **Tweakpane** for runtime UI controls
- **Cloudflare Workers** for deployment

## License

ISC
