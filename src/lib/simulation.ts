import { Cushion, CushionCollision, getCollision, CollisionFinder } from "./collision";
import Vector2D from './vector2d'
import Circle from "./circle";

export interface CircleSnapshot {
  id: string
  position: Vector2D
  velocity: Vector2D
  radius: number
  time: number
}

export interface ReplayData {

  // Absolute timestamp
  time: number
  snapshots: CircleSnapshot[]
  type: EventType,
  cushionType?: Cushion
}

export enum EventType {
  CircleCollision = 'CIRCLE_COLLISION',
  CushionCollision = 'CUSHION_COLLISION',
  StateUpdate = 'STATE_UPDATE'
}

/**
 * 
 * @param time the total timespan (in seconds) to simulate
 */
export function simulate (tableWidth: number, tableHeight: number, time: number, circles: Circle[]) {
  let currentTime = 0
  const replay: ReplayData[] = []

  // initial snapshot
  replay.push({
    time: 0,
    type: EventType.StateUpdate,
    snapshots: circles.map((circle) => {
      return {
        id: circle.id,
        position: [circle.position[0], circle.position[1]],
        velocity: [circle.velocity[0], circle.velocity[1]],
        radius: circle.radius,
        time: circle.time
      } as CircleSnapshot
    })
  })

  const collisionFinder = new CollisionFinder(tableWidth, tableHeight, circles)

  while (currentTime < time) {
    const collision = collisionFinder.pop()


    // Don't use relative time.
    // Always recompute all absolute time positions per collision
    // This costs a tiny bit more computational power and introduces more floating point rounding errors
    // but makes the collision detection more reliable
    for (const circle of circles) {
      circle.advanceTime(collision.time)
    }

    if (collision.type === 'Cushion') {
      const cc = (collision as CushionCollision)
      const circle = cc.circles[0]
      if (cc.cushion === Cushion.North || cc.cushion === Cushion.South) {
        circle.velocity[1] = (-circle.velocity[1])
      } else if (cc.cushion === Cushion.East || cc.cushion === Cushion.West) {
        circle.velocity[0] = (-circle.velocity[0])
      }

      // To prevent floating point rounding errors from interfering
      // We force the position to be accurate instead of computing it
      switch (cc.cushion) {
        case Cushion.North:
          circle.position[1] = tableHeight - circle.radius
          break
        case Cushion.East:
          circle.position[0] = tableWidth - circle.radius
          break
        case Cushion.South:
          circle.position[1] = circle.radius
          break
        case Cushion.West:
          circle.position[0] = circle.radius
          break

      }
    } else {
      const c1 = collision.circles[0]
      const c2 = collision.circles[1]
      const [vx1, vy1] = c1.velocity
      const [vx2, vy2] = c2.velocity

      const [x1, y1] = c1.position
      const [x2, y2] = c2.position
      let dx = x1 - x2,
          dy = y1 - y2
      
      const dist = Math.sqrt(dx * dx + dy * dy)
      dx = dx / dist
      dy = dy / dist

      const v1dot = dx * vx1 + dy * vy1
      
      const vx1Collide = dx * v1dot, 
            vy1Collide = dy * v1dot
      const vx1Remainder = vx1 - vx1Collide,
            vy1Remainder = vy1 - vy1Collide

      const v2dot = dx * vx2 + dy * vy2
      const vx2Collide = dx * v2dot,
            vy2Collide = dy * v2dot

      const vx2Remainder = vx2 - vx2Collide, 
            vy2Remainder = vy2 - vy2Collide

      const v1Length = Math.sqrt(vx1Collide * vx1Collide + vy1Collide * vy1Collide) * Math.sign(v1dot)
      const v2Length = Math.sqrt(vx2Collide * vx2Collide + vy2Collide * vy2Collide) * Math.sign(v2dot)

      const commonVelocity = 2 * (c1.mass * v1Length + c2.mass * v2Length) / (c1.mass + c2.mass)
      const v1LengthAfterCollision = commonVelocity - v1Length
      const v2LengthAfterCollision = commonVelocity - v2Length

      const c1Scale = v1LengthAfterCollision / v1Length
      const c2Scale = v2LengthAfterCollision / v2Length
      
      c1.velocity = [vx1Collide * c1Scale + vx1Remainder, vy1Collide * c1Scale + vy1Remainder]
      c2.velocity = [vx2Collide * c2Scale + vx2Remainder, vy2Collide * c2Scale + vy2Remainder] 
    }

    currentTime = collision.time

    const replayData: ReplayData = {
      time: currentTime,
      type: collision.type === 'Cushion' ? EventType.CushionCollision : EventType.CircleCollision,
      cushionType: (collision as CushionCollision).cushion,
      snapshots: collision.circles.map((circle) => {
        return {
          id: circle.id,
          position: [circle.position[0], circle.position[1]],
          velocity: [circle.velocity[0], circle.velocity[1]],
          radius: circle.radius,
          time: circle.time
        } as CircleSnapshot
      })
    }

    replay.push(replayData)

    collisionFinder.recompute(collision.circles[0].id, collision.circles[1] && collision.circles[1].id)
  }
  return replay
}