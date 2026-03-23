# Architecture: Analytical Billiards Collision Simulation

## Why Analytical?

Most physics simulations use **delta-time stepping**: advance all objects by a fixed dt each frame, check for overlaps, resolve collisions retroactively. This approach suffers from tunneling (fast objects pass through each other), requires small timesteps for accuracy, and produces approximate results.

This simulation uses an **analytical event-driven** approach:

1. **Compute exact collision times** using closed-form equations
2. **Store all future collisions** in a priority queue (Red-Black Tree)
3. **Process events in chronological order** — no fixed timestep
4. **Between events**, all motion is uniform (constant velocity) and positions are computed exactly via `position + velocity * (t - t₀)`

The result is mathematically exact collision detection with zero tunneling, independent of frame rate or timestep size.

## System Architecture

```
┌─────────────────────────────┐          ┌──────────────────────────────────┐
│        Web Worker            │          │          Main Thread              │
│                              │          │                                  │
│  randomCircle() generation   │◄─────── │  INITIALIZE_SIMULATION           │
│  simulate() loop             │◄─────── │  REQUEST_SIMULATION_DATA         │
│  CollisionFinder (RBTree)    │          │                                  │
│                              │ ───────► │  ReplayData[] buffer             │
│  Runs entirely off main      │          │  requestAnimationFrame loop      │
│  thread for responsiveness   │          │  Three.js 3D scene               │
│                              │          │  Canvas 2D overlay               │
│                              │          │  Tweakpane UI                    │
└─────────────────────────────┘          └──────────────────────────────────┘
```

## Core Simulation Loop

**File:** `src/lib/simulation.ts` — `simulate(tableWidth, tableHeight, time, circles)`

```
1. Record initial state snapshot (EventType.StateUpdate)
2. Create CollisionFinder with all circles
3. While currentTime < endTime:
   a. Pop earliest collision from RBTree
   b. Advance ALL circles to collision.time (absolute time)
   c. Apply collision response (cushion or circle-circle)
   d. Record ReplayData snapshot of affected circles
   e. Recompute future collisions for affected circles only
4. Return ReplayData[] array
```

The simulation produces a complete timeline of collision events. No rendering happens here — the output is a pure data stream.

## Collision Detection Math

### Circle-Cushion Collisions

**File:** `src/lib/collision.ts` — `getCushionCollision()`

For a circle at position `(px, py)` with velocity `(vx, vy)` and radius `r`, compute time to each wall:

```
t_north = (tableHeight - r - py) / vy
t_east  = (tableWidth  - r - px) / vx
t_south = (r - py) / vy
t_west  = (r - px) / vx
```

Take the smallest positive result (filtering out `t ≤ ε` and `t = ∞`). The collision time is stored as `t_relative + circle.time` to convert to absolute time.

### Circle-Circle Collisions

**File:** `src/lib/collision.ts` — `getCircleCollisionTime()`

Transform into a relative frame where one circle is stationary:

```
v_rel = v₁ - v₂           (relative velocity)
p_rel = p₁(t₂) - p₂       (relative position, both projected to same time)
```

Two circles collide when their center distance equals `r₁ + r₂`. This gives:

```
|p_rel + v_rel · t|² = (r₁ + r₂)²
```

Expanding into standard quadratic form `at² + bt + c = 0`:

```
a = vx² + vy²                          (relative speed squared)
b = 2(px·vx + py·vy)                   (dot product of relative pos & vel)
c = px² + py² - (r₁ + r₂)²            (current distance² minus collision distance²)
```

Solve via quadratic formula. Take the smallest positive root. If discriminant is negative, circles never collide. If circles already overlap (`√c < 0` effectively), return `undefined` to prevent re-detection.

## Collision Response

### Cushion Response

**File:** `src/lib/simulation.ts` lines 63-87

1. Negate the velocity component perpendicular to the wall:
   - North/South wall: `vy = -vy`
   - East/West wall: `vx = -vx`
2. Snap position to exact boundary (e.g., `py = tableHeight - r` for North) to prevent floating-point creep

### Circle-Circle Response (Elastic)

**File:** `src/lib/simulation.ts` lines 88-128

1. Compute collision normal: `n = normalize(p₁ - p₂)`
2. Project each velocity onto the normal:
   ```
   v₁_normal = n · dot(v₁, n)     v₁_tangent = v₁ - v₁_normal
   v₂_normal = n · dot(v₂, n)     v₂_tangent = v₂ - v₂_normal
   ```
3. Apply 1D elastic collision along the normal:
   ```
   v_common = 2(m₁·|v₁_n| + m₂·|v₂_n|) / (m₁ + m₂)
   v₁_n_after = v_common - |v₁_n|
   v₂_n_after = v_common - |v₂_n|
   ```
4. Recombine: `v_after = v_normal_after + v_tangent`

Tangent components are preserved (no friction). All masses are currently equal (100), so this reduces to a velocity exchange along the normal.

## Priority Queue and Recomputation

**File:** `src/lib/collision.ts` — `CollisionFinder`

### Data Structures

- **`RBTree<Collision>`**: Red-Black Tree ordered by collision time. O(log n) insert, O(1) min access.
- **`RelationStore<Collision>`**: Maps each circle ID to the set of `Collision` objects it participates in. Enables efficient cleanup when a collision invalidates future predictions.

### Operations

**`initialize()`**: For each pair of circles, compute collision time. For each circle, compute cushion collision time. Insert all valid collisions into the tree. Register in `RelationStore`. Complexity: O(n² log n).

**`pop()`**: Remove the minimum (earliest) collision. For each circle involved, look up ALL its collisions via `RelationStore`, remove them from the tree, and clear the relation store entries. This invalidates stale predictions.

**`recompute(circleId)`**: After a collision changes a circle's velocity, compute its new cushion collision and test it against ALL other circles. Insert valid collisions into tree and relation store. Complexity: O(n) per call.

### Per-Event Cost

Each collision event involves:
- 1 `pop()`: O(k · c · log n) where k = involved circles, c = average collisions per circle
- k `recompute()` calls: O(k · n · log n)

For circle-circle collisions (k=2), total is O(n log n) per event.

## Worker-Main Thread Protocol

### Message Types

**Requests** (`worker-request.ts`):
- `INITIALIZE_SIMULATION` — `{ numBalls, tableWidth, tableHeight }`
- `REQUEST_SIMULATION_DATA` — `{ time }` (milliseconds to simulate)

**Responses** (`worker-response.ts`):
- `SIMULATION_INITIALIZED` — `{ status, tableWidth, tableHeight, numBalls }`
- `SIMULATION_DATA` — `{ data: ReplayData[], initialValues?: ReplayData }`

### Flow

1. Main thread creates worker, sends `INITIALIZE_SIMULATION`
2. Worker generates non-overlapping circles via brute-force random placement (reset after 5000 failed attempts)
3. Worker responds `SIMULATION_INITIALIZED` with `status: true`
4. Main thread sends `REQUEST_SIMULATION_DATA` with `time: PRECALC * 2` (20 seconds)
5. Worker runs `simulate()`, returns `SIMULATION_DATA` with `initialValues` (first batch only) + event array
6. Main thread buffers events. When remaining buffer < `PRECALC` (10 seconds), requests more data
7. Worker accumulates time: each request adds to the previous endpoint, enabling continuous simulation

### ReplayData Structure

```typescript
{
  time: number              // Absolute timestamp (ms)
  snapshots: [{             // State of affected circles
    id: string
    position: [x, y]
    velocity: [vx, vy]
    radius: number
    time: number
  }]
  type: EventType           // CircleCollision | CushionCollision | StateUpdate
  cushionType?: Cushion     // North | East | South | West (only for cushion events)
}
```

## Playback and Rendering

**File:** `src/index.ts`

### Animation Loop

```
step(timestamp):
  progress = (timestamp - start) * simulationSpeed

  // Request more data if buffer is running low
  if (lastBufferedEvent.time - progress < PRECALC) → request more

  // Consume events up to current time
  while (nextEvent && progress >= nextEvent.time):
    Apply snapshots to circle state
    Advance all circles to event time
    Shift to next event

  // Render at current progress time
  Clear 2D canvas
  For each enabled renderer: render all circles
  Update 3D scene positions via positionAtTime(progress)
  Render Three.js scene
```

**Key insight**: Between collision events, `positionAtTime(progress)` is not an approximation — circles truly move at constant velocity between collisions, so linear interpolation is exact.

### 3D Rendering (`src/lib/scene/simulation-scene.ts`)

- Three.js scene with PerspectiveCamera and OrbitControls
- Per-ball `SphereGeometry` + `MeshStandardMaterial` with environment map reflections
- Two SpotLights with configurable shadows
- 2D canvas serves as the table surface texture (updated each frame)
- Ball colors are deterministically generated from UUIDs

### 2D Overlay Renderers (`src/lib/renderers/`)

All extend base `Renderer` class. Togglable via config:

| Renderer | Purpose |
|----------|---------|
| `CircleRenderer` | Ball outlines, red dot on next-collision participants |
| `TailRenderer` | Motion trail history (configurable length) |
| `CollisionRenderer` | Next collision position + prediction lines |
| `CollisionPreviewRenderer` | Preview of next N collision positions |

## Configuration

**File:** `src/lib/config.ts`

Default configuration (key values):

| Parameter | Default | Notes |
|-----------|---------|-------|
| `numBalls` | 150 | Restart required |
| `tableWidth` | 2840mm | Standard snooker table |
| `tableHeight` | 1420mm | Standard snooker table |
| `simulationSpeed` | 1.0x | Live adjustable (0.1-5x) |
| `shadowsEnabled` | true | Live toggle |
| `ballSegments` | 32 | Restart required |
| `ballRoughness` | 0 | 0 = glossy, 1 = matte |

UI is built with Tweakpane (`src/lib/ui.ts`). Parameters are divided into:
- **Restart-required**: numBalls, table dimensions, ball segments
- **Live-update**: shadows, lighting, camera, roughness, overlays, speed

---

## Future Improvements

### Physics Enhancements

**Friction / Deceleration**
- Add a deceleration coefficient to each circle. Velocity decreases over time: `v(t) = v₀ - μ·t` (linear) or `v(t) = v₀ · e^(-μt)` (exponential).
- `positionAtTime(t)` changes from linear to quadratic (or exponential) extrapolation.
- Cushion collision time becomes a quadratic equation instead of linear.
- Circle-circle collision time becomes a quartic equation — likely requires numerical root-finding (Newton-Raphson or bisection) rather than closed-form.
- Balls would eventually stop, needing a "rest" state to remove them from the collision finder.

**Coefficient of Restitution (Energy Loss)**
- Multiply post-collision normal velocity by `e < 1` (e.g., 0.95) instead of pure elastic exchange.
- Combined with friction, balls would naturally come to rest over time.
- Straightforward change in `simulation.ts` collision response — scale `v_after_normal` by `e`.

**Angular Momentum / Spin**
- Track angular velocity per ball. On collision, surface friction transfers between angular and linear momentum.
- Enables effects like topspin, backspin, and english (sidespin).
- Significantly increases complexity: requires torque calculations, rolling vs. sliding state transitions, and modified collision response equations.

**Variable Ball Mass and Radius**
- The collision math already supports different masses via the `commonVelocity` formula.
- Expose mass/radius per ball in config, or use standard billiards specifications (cue ball weight differs from object balls).

### Performance Improvements

**Spatial Partitioning**
- `CollisionFinder.recompute()` currently tests against ALL n circles — O(n) per recomputed circle.
- A spatial hash grid (cell size = 2 × max_radius) or quad-tree would reduce average-case to O(√n).
- Significant impact at high ball counts (500+). At 150 balls, current O(n) is fast enough.

**Transferable Objects for Worker Communication**
- `ReplayData[]` is serialized via structured clone (deep copy).
- For large batches, pack data into `ArrayBuffer` and transfer ownership (zero-copy) using the `Transferable` interface.
- Would reduce memory allocation and GC pressure during data transfer.

**Incremental Event Streaming**
- Currently, `simulate()` computes all events for a time span and returns them in one batch.
- Streaming events incrementally (e.g., one at a time or in small chunks) would reduce memory pressure and initial latency.
- Could use `MessagePort` for a dedicated streaming channel.

### Code Quality

**Fix `isInitialized` Bug**
- `simulation.worker.ts` line 8: change `const isInitialized = false` to `let isInitialized = false` and set to `true` after initialization.

**Wire Up Benchmarks**
- Add `"bench": "tsx src/benchmark.ts"` (or similar) to `package.json` scripts.

**Expand Test Coverage**
- Simulation end-to-end: verify energy conservation (sum of kinetic energies unchanged after collision), verify all balls stay within table bounds.
- `CollisionFinder.recompute()`: verify that after recomputation, the next collision time is correct.
- Edge cases: two balls with identical position at generation, zero-velocity balls, single ball bouncing between walls.

**Extract Collision Response**
- The collision response logic in `simulation.ts` (lines 63-128) is substantial. Extract into `applyCushionCollision()` and `applyCircleCollision()` functions for testability and readability.

### Feature Additions

**Pockets**
- Define pocket positions as circles at table corners and side midpoints.
- Detect ball-pocket "collision" (ball center enters pocket radius).
- Remove pocketed balls from simulation and rendering.

**Cue Interaction**
- Allow click/drag on the cue ball to set its velocity vector.
- Requires: pause simulation, accept user input, reinitialize simulation with new initial conditions.
- Could reuse existing worker restart mechanism.

**Ball Textures / Numbering**
- Apply numbered textures to sphere meshes for realistic billiards appearance.
- Requires UV mapping on `SphereGeometry` and a texture atlas for ball numbers.

**Replay Controls**
- Pause, rewind, slow-motion, frame-step.
- Since all events are pre-computed `ReplayData[]`, rewind is feasible: store full-state snapshots at regular intervals, replay forward from the nearest snapshot.
- The existing `simulationSpeed` config could be extended to support 0 (pause) and negative values (rewind).

**Collision Statistics Overlay**
- Display: total collision count, average time between collisions, kinetic energy graph over time, velocity distribution histogram.
- All data is available from the `ReplayData[]` stream — purely a rendering/UI addition.
