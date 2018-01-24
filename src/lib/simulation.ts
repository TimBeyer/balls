import { Cushion, CushionCollision, getCollisions } from "./collision";
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
  absoluteTime: number
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
    absoluteTime: 0,
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

  // for (let i = 0; i < 10; i++) {
  // 
  while (currentTime < time) {
    const collisions = getCollisions(tableWidth, tableHeight, circles)

    const collision = collisions[0]

    for (const circle of collision.circles) {
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
      const firstVel = collision.circles[0].velocity.slice() as Vector2D
      collision.circles[0].velocity = collision.circles[1].velocity.slice() as Vector2D
      collision.circles[1].velocity = firstVel
    }

    currentTime = collision.time

    const replayData: ReplayData = {
      absoluteTime: currentTime,
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
  }
  return replay
}