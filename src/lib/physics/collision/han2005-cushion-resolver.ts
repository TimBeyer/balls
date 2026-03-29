/**
 * Han 2005 cushion collision model.
 *
 * Reference: ekiefl.github.io/2020/04/24/pooltool-theory/
 *
 * Coordinate system (per-cushion reference frame):
 *   ref x = into cushion (perpendicular to wall)
 *   ref y = along rail (parallel to wall)
 *   ref z = vertical (up)
 *
 * The cushion contact point is above the ball center by `config.cushionHeight` mm.
 * θ = arcsin(cushionHeight / R) defines the contact angle.
 * This creates an angled impulse that transfers energy between linear and angular velocity,
 * and can give the ball a vertical velocity component (ball jumps).
 *
 * Post-collision velocities are computed as impulse-based DELTAS added to initial values.
 * Angular velocity deltas are derived from the impulse vector.
 *
 * Also handles:
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
    const I_factor = 5 / (2 * R) // mR/I where I = (2/5)mR²

    const vx = ball.velocity[0]
    const vy = ball.velocity[1]
    const vz = ball.velocity[2]
    const wx = ball.angularVelocity[0]
    const wy = ball.angularVelocity[1]
    const wz = ball.angularVelocity[2]

    // Decompose into Han 2005 reference frame per cushion.
    // ref x = into cushion (perpendicular), ref y = along rail (parallel)
    // omegaXRef = ω about ref x-axis, omegaYRef = ω about ref y-axis
    let vPerp: number, vPar: number
    let omegaXRef: number, omegaYRef: number

    switch (cushion) {
      case Cushion.North: // wall at +y, ref x = +y, ref y = +x
        vPerp = vy; vPar = vx
        omegaXRef = wy; omegaYRef = wx
        break
      case Cushion.South: // wall at -y, ref x = -y, ref y = -x
        vPerp = -vy; vPar = -vx
        omegaXRef = -wy; omegaYRef = -wx
        break
      case Cushion.East: // wall at +x, ref x = +x, ref y = -y
        vPerp = vx; vPar = -vy
        omegaXRef = wx; omegaYRef = -wy
        break
      case Cushion.West: // wall at -x, ref x = -x, ref y = +y
        vPerp = -vx; vPar = vy
        omegaXRef = -wx; omegaYRef = wy
        break
    }

    // Han 2005 intermediate quantities (reference: pooltool source)
    // c = component of velocity along contact normal
    // sx, sy = sliding velocity components at the contact point
    // Note: sx uses vz (vertical), NOT vPar — matching the reference implementation
    const c = vPerp * cosTheta
    const sx = vPerp * sinTheta - vz * cosTheta + R * omegaYRef
    const sy = -vPar - R * wz * cosTheta + R * omegaXRef * sinTheta

    const Pze = ball.physicsParams.mass * c * (1 + e)
    const sNorm = Math.sqrt(sx * sx + sy * sy)
    const Pzs = (2 * ball.physicsParams.mass / 7) * sNorm

    // Post-collision velocities (impulse-based DELTAS added to initial velocity)
    let newVPerp: number, newVPar: number, newVZ: number
    // Angular velocity deltas from impulse: Δω = (R × J) / I
    let newOmegaXRef: number, newOmegaYRef: number, newOmegaZ: number

    if (sNorm < 1e-12 || Pzs <= Pze) {
      // No-sliding case: friction is sufficient to prevent sliding
      newVPerp = vPerp - (2 / 7) * sx * sinTheta - (1 + e) * c * cosTheta
      newVPar = vPar + (2 / 7) * sy
      newVZ = vz + (2 / 7) * sx * cosTheta - (1 + e) * c * sinTheta

      // Angular velocity deltas for no-sliding: Δω from impulse (R/I factor = 5/(7R))
      const angFactor = 5 / (7 * R)
      newOmegaXRef = omegaXRef - angFactor * sy * sinTheta
      newOmegaYRef = omegaYRef - angFactor * sx
      newOmegaZ = wz + angFactor * sy * cosTheta
    } else {
      // Full sliding case: friction is Coulomb-limited
      const mu = Pze / (ball.physicsParams.mass * sNorm)
      const cosPhi = sx / sNorm
      const sinPhi = sy / sNorm

      newVPerp = vPerp - c * (1 + e) * (mu * cosPhi * sinTheta + cosTheta)
      newVPar = vPar + c * (1 + e) * mu * sinPhi
      newVZ = vz + c * (1 + e) * (mu * cosPhi * cosTheta - sinTheta)

      // Angular velocity deltas for sliding: Δω from impulse
      const angFactor2 = I_factor * c * (1 + e)
      newOmegaXRef = omegaXRef - angFactor2 * mu * sinPhi * sinTheta
      newOmegaYRef = omegaYRef - angFactor2 * mu * cosPhi
      newOmegaZ = wz + angFactor2 * mu * sinPhi * cosTheta
    }

    // Only positive vZ makes the ball airborne. Negative means cushion pushes
    // ball into table — table normal force prevents this.
    newVZ = Math.max(0, newVZ)

    // Map back to world frame
    // Perpendicular velocity must point away from wall (negative in ref frame = away)
    // We use -Math.abs to ensure it always points away
    switch (cushion) {
      case Cushion.North: // ref x = +y, ref y = +x
        ball.velocity[0] = newVPar
        ball.velocity[1] = -Math.abs(newVPerp)
        ball.velocity[2] = newVZ
        ball.angularVelocity[0] = newOmegaYRef
        ball.angularVelocity[1] = newOmegaXRef
        ball.angularVelocity[2] = newOmegaZ
        break
      case Cushion.South: // ref x = -y, ref y = -x
        ball.velocity[0] = -newVPar
        ball.velocity[1] = Math.abs(newVPerp)
        ball.velocity[2] = newVZ
        ball.angularVelocity[0] = -newOmegaYRef
        ball.angularVelocity[1] = -newOmegaXRef
        ball.angularVelocity[2] = newOmegaZ
        break
      case Cushion.East: // ref x = +x, ref y = -y
        ball.velocity[0] = -Math.abs(newVPerp)
        ball.velocity[1] = -newVPar
        ball.velocity[2] = newVZ
        ball.angularVelocity[0] = newOmegaXRef
        ball.angularVelocity[1] = -newOmegaYRef
        ball.angularVelocity[2] = newOmegaZ
        break
      case Cushion.West: // ref x = -x, ref y = +y
        ball.velocity[0] = Math.abs(newVPerp)
        ball.velocity[1] = newVPar
        ball.velocity[2] = newVZ
        ball.angularVelocity[0] = -newOmegaXRef
        ball.angularVelocity[1] = newOmegaYRef
        ball.angularVelocity[2] = newOmegaZ
        break
    }
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
