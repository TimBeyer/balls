# Performance Improvement Plan

Tracked list of identified performance improvements for the billiards collision simulation.
Each item should be implemented in a separate PR with benchmark proof.

Run `npm run benchmark` to measure current performance. Use `npm run benchmark:json` for CI-comparable JSON output.

---

## Rendering Improvements (main thread)

### 1. Cache `stringToRGB` results
- **Status:** Not started
- **File:** `src/lib/string-to-rgb.ts`
- **Description:** Add a `Map<string, string>` cache at module level. Return cached value on hit, compute + store on miss.
- **Impact:** Eliminates ~600 hash computations per frame (150 circles × up to 4 renderers).

### 2. Pre-compute next-event circle ID Set
- **Status:** Not started
- **Files:** `src/index.ts`, `src/lib/renderers/circle-renderer.ts`, `src/lib/renderers/collision-renderer.ts`, `src/lib/renderers/collision-preview-renderer.ts`
- **Description:** Before the render loop, create `new Set(nextEvent.snapshots.map(s => s.id))` and a `Map<string, CircleSnapshot>` for lookups. Pass to renderers. Replace `Array.map().includes()` (O(n) per circle) with `Set.has()` (O(1)).
- **Impact:** Removes 300+ O(n) lookups per frame.

### 3. Circular buffer for tail renderer
- **Status:** Not started
- **File:** `src/lib/renderers/tail-renderer.ts`
- **Description:** Replace `number[][]` with a fixed-size circular buffer (pre-allocated array + head/size counters). Eliminates `Array.shift()` which is O(tailLength) per circle per frame.
- **Impact:** O(n) → O(1) per circle per frame for tail management.

### 4. Remove duplicate arc in CollisionRenderer
- **Status:** Not started
- **File:** `src/lib/renderers/collision-renderer.ts`
- **Description:** Lines 24-33 and 36-46 draw the exact same arc with the same strokeStyle. Remove the first duplicate block.
- **Impact:** Halves canvas draw calls for collision visualization.

### 5. Optimize TailRenderer distance calculation
- **Status:** Not started
- **File:** `src/lib/renderers/tail-renderer.ts`
- **Description:** Replace `Math.sqrt(Math.pow(...))` with squared distance comparison (`dx*dx + dy*dy > 10000`). Cache `toScreenCoords(pos)` result instead of calling it twice per segment (lines 38, 40).
- **Impact:** Eliminates sqrt + pow per tail segment per circle per frame.

### 6. Cache 2D canvas context
- **Status:** Not started
- **File:** `src/index.ts`
- **Description:** Move `canvas2D.getContext('2d')` (line 208) out of the `step()` animation loop into `initScene()`. Store as a variable and reuse.
- **Impact:** Minor — removes repeated context lookup per frame.

---

## Simulation Engine (worker side)

### 7. Spatial grid for collision recompute ⭐
- **Status:** Not started
- **File:** `src/lib/collision.ts`
- **Description:** Add a `SpatialGrid` class with uniform cells (~150mm). On `recompute(circleId)`, only test circles in the same cell and 8 adjacent cells instead of ALL circles. Update grid membership when circles move.
- **Impact:** **Highest impact for scaling.** Reduces `recompute()` from O(n) to O(~9 neighbors). At 500 balls, eliminates ~990 unnecessary quadratic solves per collision event.

### 8. Avoid allocations in `positionAtTime()`
- **Status:** Not started
- **Files:** `src/lib/circle.ts`, `src/lib/collision.ts`
- **Description:** Add `positionAtTimeInto(time: number, out: Vector2D): Vector2D` method that writes into a reusable buffer. Use in `getCircleCollisionTime()` (line 89) to avoid allocating a new `[number, number]` tuple per call. Keep existing `positionAtTime()` for renderer callers.
- **Impact:** Eliminates O(n²) tuple allocations during collision detection. Reduces GC pressure.

### 9. Optimize RelationStore.get()
- **Status:** Not started
- **File:** `src/lib/collision.ts`
- **Description:** Add `getSet(key: string): Set<Entity> | undefined` that returns the raw Set directly. Update `pop()` (line 239) to use it and iterate without creating new Set + Array.from().
- **Impact:** Eliminates 2 allocations per collision event in `pop()`.

### 10. Early discriminant check in quadratic solver
- **Status:** Not started
- **File:** `src/lib/collision.ts`
- **Description:** In `getCircleCollisionTime()`, compute discriminant `b*b - 4*a*c` first. If negative, return `undefined` immediately — avoids `Math.sqrt(NaN)` and downstream NaN checks.
- **Impact:** Saves one `Math.sqrt()` call for every non-colliding circle pair (~80%+ of all pairs).

### 11. Cushion collision velocity culling
- **Status:** Not started
- **File:** `src/lib/collision.ts`
- **Description:** In `getCushionCollision()`, skip wall calculations when velocity direction makes collision impossible: skip north if `vy <= 0`, east if `vx <= 0`, south if `vy >= 0`, west if `vx >= 0`.
- **Impact:** Reduces 4 divisions to 1-2 on average per cushion collision check.

### 12. Lazy circle time advancement
- **Status:** Not started
- **File:** `src/lib/simulation.ts`
- **Description:** In the simulation loop (lines 55-61), only `advanceTime()` on the circles involved in the collision, not all N circles. Other circles' positions are computed lazily via `positionAtTime()`. Risk: may accumulate float drift — mitigate by resyncing all circles every ~100 events.
- **Impact:** Eliminates ~148 unnecessary `advanceTime()` calls per collision event at 150 balls.

### 13. Spatial grid for circle generation
- **Status:** Not started
- **File:** `src/lib/simulation.worker.ts`
- **Description:** Use a grid-based spatial index during circle placement to check only nearby cells for overlap, instead of scanning all existing circles. Also: instead of full reset after 5000 failures, try systematic grid-based placement with jitter.
- **Impact:** Reduces per-attempt collision check from O(n) to O(1) average. Dramatically speeds up initialization at high ball counts.

---

## Worker Communication

### 14. Use numeric indices in ReplayData
- **Status:** Not started
- **Files:** `src/lib/simulation.ts`, `src/lib/simulation.worker.ts`, `src/index.ts`
- **Description:** Assign each circle a numeric index (0..n-1) during initialization. Use the index instead of UUID string in `CircleSnapshot.id`. Main thread maintains index→Circle mapping.
- **Impact:** Reduces serialization overhead per snapshot (number vs 36-char UUID string).

### 15. Avoid array copies in snapshots
- **Status:** Not started
- **File:** `src/lib/simulation.ts`
- **Description:** In snapshot creation (lines 137-145), use `position: circle.position` directly instead of `[circle.position[0], circle.position[1]]`. Safe because `postMessage` structured clone copies the data before any subsequent mutation.
- **Impact:** Eliminates 2 array allocations per snapshot per collision event.
