/**
 * Cue stick 3D visual — a tapered cylinder that follows the aim direction.
 *
 * Positioned behind the cue ball, rotated to match aim angle.
 * Translates backward proportional to power during pull-back.
 */

import * as THREE from 'three'

const CUE_LENGTH = 1400 // mm
const CUE_TIP_RADIUS = 5 // mm
const CUE_BUTT_RADIUS = 15 // mm
const CUE_SEGMENTS = 16
const PULL_BACK_DISTANCE = 200 // mm max pull-back

export class CueStick {
  public mesh: THREE.Mesh
  private visible = false

  constructor() {
    const geometry = new THREE.CylinderGeometry(CUE_TIP_RADIUS, CUE_BUTT_RADIUS, CUE_LENGTH, CUE_SEGMENTS)
    // Shift geometry so origin is at the tip
    geometry.translate(0, -CUE_LENGTH / 2, 0)

    const material = new THREE.MeshStandardMaterial({
      color: 0xd4a574,
      roughness: 0.6,
    })

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.castShadow = true
    this.mesh.visible = false

    // The cue lies along the Y axis by default (tip at origin).
    // We'll rotate it to match the aim direction.
  }

  /**
   * Update cue position and orientation.
   *
   * @param cueBallPos Physics coordinates [x, y] of the cue ball
   * @param direction Aim direction in radians (physics coords)
   * @param power 0..1 power level
   * @param tableWidth Table width in mm
   * @param tableHeight Table height in mm
   * @param ballRadius Ball radius in mm
   */
  update(
    cueBallPos: [number, number],
    direction: number,
    power: number,
    tableWidth: number,
    tableHeight: number,
    ballRadius: number,
  ) {
    if (!this.visible) return

    // Convert physics coords to Three.js coords
    const threeX = cueBallPos[0] - tableWidth / 2
    const threeZ = cueBallPos[1] - tableHeight / 2

    // The cue points OPPOSITE to the aim direction (behind the cue ball)
    // In physics: direction is where the ball will go
    // Cue stick is behind the ball, pointing toward it
    const pullBack = ballRadius + 5 + power * PULL_BACK_DISTANCE

    // Position: behind the cue ball along the opposite direction
    const behindX = threeX - Math.cos(direction) * pullBack
    const behindZ = threeZ - Math.sin(direction) * pullBack

    this.mesh.position.set(behindX, ballRadius, behindZ)

    // Rotation: the cue cylinder is along local Y axis.
    // We need to rotate it to lie along the aim direction on the table plane.
    // First, lay it flat (rotate 90° around X to go from Y-up to Z-forward)
    // Then rotate around Y to match the aim direction.
    // Three.js: aim direction in physics (angle from +X toward +Y) maps to
    // Three.js (angle from +X toward +Z), and Z = physics Y.
    const euler = new THREE.Euler(Math.PI / 2, 0, -direction + Math.PI, 'YXZ')
    this.mesh.setRotationFromEuler(euler)
  }

  show() {
    this.visible = true
    this.mesh.visible = true
  }

  hide() {
    this.visible = false
    this.mesh.visible = false
  }

  isVisible(): boolean {
    return this.visible
  }
}
