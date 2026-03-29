/**
 * Trajectory preview — analytically computes the cue ball's path to first contact.
 *
 * Uses the same quartic detector as the physics engine to find the first
 * ball-ball collision, and the quadratic solver for cushion hits.
 * Renders a dotted aim line, ghost ball at contact, and deflection angles.
 */

import Ball from '../ball'
import type Vector2D from '../vector2d'
import type { TableConfig } from '../table-config'
import { QuarticBallBallDetector } from '../physics/detection/ball-ball-detector'
import { QuadraticCushionDetector } from '../physics/detection/cushion-detector'
import { SegmentedCushionDetector } from '../physics/detection/segmented-cushion-detector'
import { createPoolPhysicsProfile } from '../physics/physics-profile'
import type { PhysicsConfig } from '../physics-config'

export interface PreviewResult {
  /** Points along the cue ball path (physics coordinates) */
  cuePath: Vector2D[]
  /** Position where cue ball makes first contact (ball or cushion) */
  contactPoint: Vector2D | null
  /** Type of first contact */
  contactType: 'ball' | 'cushion' | 'none'
  /** ID of the object ball hit (if ball contact) */
  contactBallId: string | null
  /** Deflection line for the object ball after contact */
  objectBallDeflection: Vector2D | null
  /** Deflection line for the cue ball after contact */
  cueBallDeflection: Vector2D | null
}

const ballBallDetector = new QuarticBallBallDetector()
const defaultCushionDetector = new QuadraticCushionDetector()

/**
 * Compute the trajectory preview for a cue shot.
 *
 * @param cueBallPos Current cue ball position
 * @param direction Aim direction in radians
 * @param speed Shot speed in mm/s
 * @param objectBalls Map of ball ID → position for all object balls on table
 * @param ballRadius Ball radius in mm
 * @param tableConfig Table geometry
 * @param physicsConfig Physics parameters
 */
export function computeTrajectoryPreview(
  cueBallPos: Vector2D,
  direction: number,
  speed: number,
  objectBalls: Map<string, Vector2D>,
  ballRadius: number,
  tableConfig: TableConfig,
  physicsConfig: PhysicsConfig,
): PreviewResult {
  const result: PreviewResult = {
    cuePath: [[...cueBallPos]],
    contactPoint: null,
    contactType: 'none',
    contactBallId: null,
    objectBallDeflection: null,
    cueBallDeflection: null,
  }

  const vx = speed * Math.cos(direction)
  const vy = speed * Math.sin(direction)

  // Create a temporary cue ball for trajectory calculation
  const profile = createPoolPhysicsProfile()

  const cueBall = new Ball(
    [cueBallPos[0], cueBallPos[1], 0],
    [vx, vy, 0],
    ballRadius,
    0,
    physicsConfig.defaultBallParams.mass,
    '__preview_cue__',
    [0, 0, 0],
    { ...physicsConfig.defaultBallParams, radius: ballRadius },
    physicsConfig,
  )
  cueBall.updateTrajectory(profile, physicsConfig)

  // Find earliest ball-ball collision
  let earliestBallTime: number | undefined
  let earliestBallId: string | undefined

  for (const [id, pos] of objectBalls) {
    const objBall = new Ball(
      [pos[0], pos[1], 0],
      [0, 0, 0],
      ballRadius,
      0,
      physicsConfig.defaultBallParams.mass,
      id,
      [0, 0, 0],
      { ...physicsConfig.defaultBallParams, radius: ballRadius },
      physicsConfig,
    )
    objBall.updateTrajectory(profile, physicsConfig)

    const time = ballBallDetector.detect(cueBall, objBall)
    if (time !== undefined && (earliestBallTime === undefined || time < earliestBallTime)) {
      earliestBallTime = time
      earliestBallId = id
    }
  }

  // Find earliest cushion collision
  const cushionDetector =
    tableConfig.pockets.length > 0
      ? new SegmentedCushionDetector(tableConfig.cushionSegments)
      : defaultCushionDetector
  const cushionCollision = cushionDetector.detect(cueBall, tableConfig.width, tableConfig.height)
  const cushionTime = cushionCollision.time

  // Determine first contact
  let contactTime: number
  if (earliestBallTime !== undefined && earliestBallTime < cushionTime) {
    contactTime = earliestBallTime
    result.contactType = 'ball'
    result.contactBallId = earliestBallId!
  } else if (isFinite(cushionTime)) {
    contactTime = cushionTime
    result.contactType = 'cushion'
  } else {
    // No contact — show a long line
    contactTime = 2 // 2 seconds ahead
  }

  // Build path points along cue ball trajectory up to contact
  const numPoints = 30
  for (let i = 1; i <= numPoints; i++) {
    const t = (contactTime * i) / numPoints
    const pos = cueBall.positionAtTime(t)
    result.cuePath.push([pos[0], pos[1]])
  }

  // Contact point
  const contactPos = cueBall.positionAtTime(contactTime)
  result.contactPoint = [contactPos[0], contactPos[1]]

  // Compute deflection angles for ball contact
  if (result.contactType === 'ball' && result.contactBallId) {
    const objPos = objectBalls.get(result.contactBallId)!

    // Contact normal: from cue ball center to object ball center
    const nx = objPos[0] - contactPos[0]
    const ny = objPos[1] - contactPos[1]
    const nLen = Math.sqrt(nx * nx + ny * ny)
    if (nLen > 0.01) {
      const nnx = nx / nLen
      const nny = ny / nLen

      // Object ball goes along the contact normal
      result.objectBallDeflection = [objPos[0] + nnx * ballRadius * 4, objPos[1] + nny * ballRadius * 4]

      // Cue ball deflects at ~90° to the object ball (for non-head-on hits)
      const dot = vx * nnx + vy * nny
      const tangentX = vx - dot * nnx
      const tangentY = vy - dot * nny
      const tangentLen = Math.sqrt(tangentX * tangentX + tangentY * tangentY)
      if (tangentLen > 0.01) {
        result.cueBallDeflection = [
          contactPos[0] + (tangentX / tangentLen) * ballRadius * 4,
          contactPos[1] + (tangentY / tangentLen) * ballRadius * 4,
        ]
      }
    }
  }

  return result
}
