/**
 * Han 2005 cushion collision model.
 *
 * Accounts for cushion height, friction at cushion contact, and spin transfer.
 * The cushion contact point is above the ball center by `config.cushionHeight` mm.
 * This creates an angled impulse that transfers energy between linear and angular velocity.
 *
 * Also handles post-collision effects:
 * - Boundary snapping (prevent floating-point escape)
 * - Trajectory acceleration clamping (prevent spin pushing ball back through wall)
 */

import type Ball from '../../ball'
import { Cushion } from '../../collision'
import type { PhysicsConfig } from '../../physics-config'
import type { CushionCollisionResolver } from './collision-resolver'

export class Han2005CushionResolver implements CushionCollisionResolver {
  resolve(ball: Ball, cushion: Cushion, tableWidth: number, tableHeight: number, config: PhysicsConfig): void {
    this.resolveVelocities(ball, cushion, config)
    this.snapToBoundary(ball, cushion, tableWidth, tableHeight)
  }

  /**
   * After updateTrajectory is called, clamp trajectory acceleration
   * that would push the ball back through the wall.
   * This must be called AFTER ball.updateTrajectory().
   */
  clampTrajectory(ball: Ball, cushion: Cushion): void {
    switch (cushion) {
      case Cushion.North:
        if (ball.trajectory.a[1] > 0) ball.trajectory.a[1] = 0
        break
      case Cushion.South:
        if (ball.trajectory.a[1] < 0) ball.trajectory.a[1] = 0
        break
      case Cushion.East:
        if (ball.trajectory.a[0] > 0) ball.trajectory.a[0] = 0
        break
      case Cushion.West:
        if (ball.trajectory.a[0] < 0) ball.trajectory.a[0] = 0
        break
    }
  }

  private resolveVelocities(ball: Ball, cushion: Cushion, config: PhysicsConfig): void {
    const R = ball.radius
    const e = ball.physicsParams.eRestitution
    const sinTheta = Math.min(1, Math.max(-1, config.cushionHeight / R))
    const cosTheta = Math.sqrt(1 - sinTheta * sinTheta)
    const m = ball.physicsParams.mass

    let vPerp: number, vPar: number
    let omegaPar: number, omegaPerp: number, omegaZ: number

    const vx = ball.velocity[0]
    const vy = ball.velocity[1]
    const wx = ball.angularVelocity[0]
    const wy = ball.angularVelocity[1]
    const wz = ball.angularVelocity[2]

    switch (cushion) {
      case Cushion.North:
        vPerp = vy; vPar = vx; omegaPar = wy; omegaPerp = wx; omegaZ = wz
        break
      case Cushion.South:
        vPerp = -vy; vPar = -vx; omegaPar = -wy; omegaPerp = -wx; omegaZ = wz
        break
      case Cushion.East:
        vPerp = vx; vPar = -vy; omegaPar = wx; omegaPerp = -wy; omegaZ = wz
        break
      case Cushion.West:
        vPerp = -vx; vPar = vy; omegaPar = -wx; omegaPerp = wy; omegaZ = wz
        break
    }

    // Han 2005 intermediate calculations
    const c = vPerp * cosTheta
    const sx = vPar * sinTheta - vPerp * cosTheta + R * omegaPar
    const sy = -vPar - R * omegaZ * cosTheta + R * omegaPerp * sinTheta

    const Pze = m * c * (1 + e)
    const sNorm = Math.sqrt(sx * sx + sy * sy)
    const Pzs = (2 * m / 7) * sNorm

    let newVPerp: number, newVPar: number
    let newOmegaPar: number, newOmegaPerp: number, newOmegaZ: number

    if (sNorm < 1e-12 || Pzs <= Pze) {
      // Insufficient friction or no sliding
      newVPar = vPar - (2 / 7) * sx * sinTheta
      newVPerp = (2 / 7) * sx * cosTheta - (1 + e) * c * sinTheta

      newOmegaPar = omegaPar - (5 / (2 * R)) * sx * sinTheta
      newOmegaPerp = omegaPerp + (5 / (2 * R)) * sy * sinTheta
      newOmegaZ = omegaZ - (5 / (2 * R)) * sy * cosTheta
    } else {
      // Full sliding regime
      const mu = Pze / (m * sNorm)
      const cosPhi = sx / sNorm
      const sinPhi = sy / sNorm

      newVPerp = -c * (1 + e) * (mu * cosPhi * cosTheta + sinTheta)
      newVPar = vPar + c * (1 + e) * mu * sinPhi

      newOmegaPar = omegaPar - (5 * c * (1 + e) * mu * cosPhi * sinTheta) / (2 * R)
      newOmegaPerp = omegaPerp + (5 * c * (1 + e) * mu * sinPhi * sinTheta) / (2 * R)
      newOmegaZ = omegaZ - (5 * c * (1 + e) * mu * sinPhi * cosTheta) / (2 * R)
    }

    // Map back to world frame, ensure perpendicular velocity points away from wall
    switch (cushion) {
      case Cushion.North:
        ball.velocity[0] = newVPar
        ball.velocity[1] = -Math.abs(newVPerp)
        ball.angularVelocity[0] = newOmegaPerp
        ball.angularVelocity[1] = newOmegaPar
        ball.angularVelocity[2] = newOmegaZ
        break
      case Cushion.South:
        ball.velocity[0] = -newVPar
        ball.velocity[1] = Math.abs(newVPerp)
        ball.angularVelocity[0] = -newOmegaPerp
        ball.angularVelocity[1] = -newOmegaPar
        ball.angularVelocity[2] = newOmegaZ
        break
      case Cushion.East:
        ball.velocity[0] = -Math.abs(newVPerp)
        ball.velocity[1] = -newVPar
        ball.angularVelocity[0] = newOmegaPar
        ball.angularVelocity[1] = -newOmegaPerp
        ball.angularVelocity[2] = newOmegaZ
        break
      case Cushion.West:
        ball.velocity[0] = Math.abs(newVPerp)
        ball.velocity[1] = newVPar
        ball.angularVelocity[0] = -newOmegaPar
        ball.angularVelocity[1] = newOmegaPerp
        ball.angularVelocity[2] = newOmegaZ
        break
    }
    ball.velocity[2] = 0
  }

  private snapToBoundary(ball: Ball, cushion: Cushion, tableWidth: number, tableHeight: number): void {
    switch (cushion) {
      case Cushion.North:
        ball.position[1] = tableHeight - ball.radius
        break
      case Cushion.East:
        ball.position[0] = tableWidth - ball.radius
        break
      case Cushion.South:
        ball.position[1] = ball.radius
        break
      case Cushion.West:
        ball.position[0] = ball.radius
        break
    }
  }
}
