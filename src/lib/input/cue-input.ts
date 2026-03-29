/**
 * Cue input handler — manages aim, power, and spin controls.
 *
 * Works with both mouse and touch via pointer events.
 * Coordinates are converted from screen space to physics space
 * via Three.js raycasting onto the table plane.
 */

import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type Vector2D from '../vector2d'
import type { ShotParams } from '../game/types'

export type CueInputState = 'idle' | 'aiming' | 'committed'

export interface CueInputCallbacks {
  /** Called continuously as the player adjusts aim */
  onAimUpdate: (direction: number, power: number) => void
  /** Called when the player commits to a shot (releases pointer) */
  onShoot: (params: ShotParams) => void
}

export class CueInput {
  private camera: THREE.PerspectiveCamera
  private canvas: HTMLCanvasElement
  private tableWidth: number
  private tableHeight: number
  private cueBallPos: Vector2D = [0, 0]
  private callbacks: CueInputCallbacks
  private controls: OrbitControls | null = null

  private state: CueInputState = 'idle'
  private aimDirection = 0
  private aimPower = 0.3
  private strikeOffset: Vector2D = [0, 0]
  private elevation = 0

  // Pointer tracking
  private pointerDown = false
  private isAimDrag = false
  private enabled = true

  // Raycaster for screen-to-table conversion
  private raycaster = new THREE.Raycaster()
  private tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  constructor(
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    tableWidth: number,
    tableHeight: number,
    _maxShotSpeed: number,
    callbacks: CueInputCallbacks,
  ) {
    this.camera = camera
    this.canvas = canvas
    this.tableWidth = tableWidth
    this.tableHeight = tableHeight
    this.callbacks = callbacks

    this.bindEvents()
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!enabled) {
      this.state = 'idle'
      this.pointerDown = false
    }
  }

  setControls(controls: OrbitControls) {
    this.controls = controls
  }

  setCueBallPosition(pos: Vector2D) {
    this.cueBallPos = pos
  }

  getState(): CueInputState {
    return this.state
  }

  getAimDirection(): number {
    return this.aimDirection
  }

  getAimPower(): number {
    return this.aimPower
  }

  getStrikeOffset(): Vector2D {
    return this.strikeOffset
  }

  setStrikeOffset(offset: Vector2D) {
    this.strikeOffset = offset
  }

  setElevation(elevation: number) {
    this.elevation = elevation
  }

  setPower(power: number) {
    this.aimPower = Math.max(0, Math.min(1, power))
    this.callbacks.onAimUpdate(this.aimDirection, this.aimPower)
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp)
  }

  private bindEvents() {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerUp)

    // Prevent default touch behaviors (scrolling, zooming) on the canvas
    this.canvas.style.touchAction = 'none'
  }

  /** Convert screen coordinates to physics table coordinates */
  private screenToTable(clientX: number, clientY: number): Vector2D | null {
    const rect = this.canvas.getBoundingClientRect()
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)

    const intersection = new THREE.Vector3()
    const hit = this.raycaster.ray.intersectPlane(this.tablePlane, intersection)
    if (!hit) return null

    // Three.js coords (x, z) → physics coords (x, y) with table offset
    const physicsX = intersection.x + this.tableWidth / 2
    const physicsY = intersection.z + this.tableHeight / 2

    return [physicsX, physicsY]
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (!this.enabled) return

    this.pointerDown = true

    const tablePos = this.screenToTable(e.clientX, e.clientY)
    if (!tablePos) return

    // Check if pointer is near-ish to the table (allow aiming from anywhere)
    this.isAimDrag = true
    this.state = 'aiming'

    // Disable orbit controls during aiming
    if (this.controls) {
      this.controls.enabled = false
    }

    // Set initial aim direction from cue ball to pointer
    const dx = tablePos[0] - this.cueBallPos[0]
    const dy = tablePos[1] - this.cueBallPos[1]
    this.aimDirection = Math.atan2(dy, dx)
    this.callbacks.onAimUpdate(this.aimDirection, this.aimPower)
  }

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.enabled || !this.pointerDown || !this.isAimDrag) return

    const tablePos = this.screenToTable(e.clientX, e.clientY)
    if (!tablePos) return

    // Update aim direction: angle from cue ball to pointer
    const dx = tablePos[0] - this.cueBallPos[0]
    const dy = tablePos[1] - this.cueBallPos[1]
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 1) {
      this.aimDirection = Math.atan2(dy, dx)
    }

    this.callbacks.onAimUpdate(this.aimDirection, this.aimPower)
  }

  private handlePointerUp = (_e: PointerEvent) => {
    if (!this.enabled || !this.pointerDown) return

    if (this.isAimDrag && this.state === 'aiming') {
      // Commit the shot
      this.state = 'committed'
      this.callbacks.onShoot({
        direction: this.aimDirection,
        power: this.aimPower,
        strikeOffset: this.strikeOffset,
        elevation: this.elevation,
      })
    }

    this.pointerDown = false
    this.isAimDrag = false

    // Re-enable orbit controls
    if (this.controls) {
      this.controls.enabled = true
    }
  }

  /** Reset to idle state (after shot simulation completes) */
  reset() {
    this.state = 'idle'
    this.pointerDown = false
    this.isAimDrag = false
    this.strikeOffset = [0, 0]
    this.elevation = 0
  }
}
