import { describe, it, expect } from 'vitest'
import Circle from '../circle'
import { simulate, EventType } from '../simulation'
import { generateCircles } from '../generate-circles'

describe('simulate', () => {
  it('head-on collision: two circles should bounce back', () => {
    const radius = 10
    const c1 = new Circle([100, 100], [1, 0], radius, 0)
    const c2 = new Circle([200, 100], [-1, 0], radius, 0)
    // Table big enough that cushions are far away
    const replay = simulate(1000, 500, 100, [c1, c2])

    const circleCollisions = replay.filter((r) => r.type === EventType.CircleCollision)
    expect(circleCollisions.length).toBeGreaterThanOrEqual(1)

    // After the first circle collision, velocities should swap (equal mass)
    const firstCollision = circleCollisions[0]
    const snap1 = firstCollision.snapshots.find((s) => s.id === c1.id)!
    const snap2 = firstCollision.snapshots.find((s) => s.id === c2.id)!
    // c1 was going right (+1,0), c2 was going left (-1,0). After elastic collision they swap.
    expect(snap1.velocity[0]).toBeCloseTo(-1, 5)
    expect(snap2.velocity[0]).toBeCloseTo(1, 5)
  })

  it('no circles should overlap at any collision event', () => {
    // Set up 4 circles in a diamond pattern, all moving inward
    const radius = 10
    const circles = [
      new Circle([200, 250], [1, 0], radius, 0),
      new Circle([400, 250], [-1, 0], radius, 0),
      new Circle([300, 150], [0, 1], radius, 0),
      new Circle([300, 350], [0, -1], radius, 0),
    ]
    const replay = simulate(1000, 500, 200, circles)

    // At every circle collision event, the two involved circles should be
    // exactly touching (distance ≈ r1 + r2), not overlapping
    const circleCollisions = replay.filter((r) => r.type === EventType.CircleCollision)
    for (const event of circleCollisions) {
      const [s1, s2] = event.snapshots
      const dx = s1.position[0] - s2.position[0]
      const dy = s1.position[1] - s2.position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const expectedDist = s1.radius + s2.radius
      expect(dist).toBeCloseTo(expectedDist, 1)
    }
  })

  it('circles should not escape the table bounds', () => {
    const tableWidth = 500
    const tableHeight = 300
    const radius = 10
    const circles = [
      new Circle([100, 150], [1.3, 0.7], radius, 0),
      new Circle([400, 150], [-0.8, 0.5], radius, 0),
      new Circle([250, 100], [0.3, -1.1], radius, 0),
    ]
    const replay = simulate(tableWidth, tableHeight, 500, circles)

    // Check all snapshots: positions must be within [radius, dimension - radius]
    for (const event of replay) {
      for (const snap of event.snapshots) {
        expect(snap.position[0]).toBeGreaterThanOrEqual(snap.radius - 1)
        expect(snap.position[0]).toBeLessThanOrEqual(tableWidth - snap.radius + 1)
        expect(snap.position[1]).toBeGreaterThanOrEqual(snap.radius - 1)
        expect(snap.position[1]).toBeLessThanOrEqual(tableHeight - snap.radius + 1)
      }
    }
  })

  it('many circles: no overlaps at collision events', () => {
    const radius = 10
    const tableWidth = 1000
    const tableHeight = 500
    // Place circles in a grid, all with different velocities
    const circles: Circle[] = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const x = 100 + col * 80
        const y = 100 + row * 80
        const vx = (col - 2) * 0.5 + 0.1
        const vy = (row - 1) * 0.5 + 0.1
        circles.push(new Circle([x, y], [vx, vy], radius, 0))
      }
    }

    const replay = simulate(tableWidth, tableHeight, 1000, circles)
    const circleCollisions = replay.filter((r) => r.type === EventType.CircleCollision)

    expect(circleCollisions.length).toBeGreaterThan(0)

    for (const event of circleCollisions) {
      const [s1, s2] = event.snapshots
      const dx = s1.position[0] - s2.position[0]
      const dy = s1.position[1] - s2.position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const expectedDist = s1.radius + s2.radius
      // Allow small floating point tolerance
      expect(dist).toBeGreaterThanOrEqual(expectedDist - 0.1)
    }
  })

  it('150 generated circles: no overlaps detected at collision events', () => {
    // Use the actual circle generator with a seeded PRNG
    let s = 42
    const seededRandom = () => {
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const circles = generateCircles(150, 2840, 1420, seededRandom)
    const replay = simulate(2840, 1420, 10000, circles)

    const circleCollisions = replay.filter((r: { type: EventType }) => r.type === EventType.CircleCollision)
    expect(circleCollisions.length).toBeGreaterThan(100)

    let overlaps = 0
    for (const event of circleCollisions) {
      const [s1, s2] = event.snapshots
      const dx = s1.position[0] - s2.position[0]
      const dy = s1.position[1] - s2.position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const expectedDist = s1.radius + s2.radius
      if (dist < expectedDist - 1) overlaps++
    }
    expect(overlaps).toBe(0)
  })

  it('simulation time advances monotonically', () => {
    const radius = 10
    const circles = [
      new Circle([100, 100], [1, 0.5], radius, 0),
      new Circle([300, 100], [-1, 0.3], radius, 0),
    ]
    const replay = simulate(1000, 500, 200, circles)

    for (let i = 1; i < replay.length; i++) {
      expect(replay[i].time).toBeGreaterThanOrEqual(replay[i - 1].time)
    }
  })
})
