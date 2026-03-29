/**
 * Cue input handler — manages aim direction via pointer events.
 *
 * Mobile-friendly design:
 *   - Single finger drag: aim the cue (sets direction)
 *   - Two-finger gesture: camera control (passed through to OrbitControls)
 *   - Shooting is done via UI button, not pointer-up (avoids accidental shots)
 *
 * Desktop: click-and-drag to aim, shoot via UI button or double-click.
 */

import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type Vector2D from '../vector2d'

export type CueInputMode = 'aim' | 'camera'
export type CueInputState = 'idle' | 'aiming' | 'committed'

export interface CueInputCallbacks {
  /** Called continuously as the player adjusts aim */
  onAimUpdate: (direction: number) => void
  /** Called when the player commits to a shot */
  onShoot: () => void
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
  private enabled = true
  private mode: CueInputMode = 'aim'

  // Multi-touch tracking
  private activePointers = new Map<number, { x: number; y: number }>()
  private isAimDrag = false

  // Raycaster for screen-to-table conversion
  private raycaster = new THREE.Raycaster()
  private tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  constructor(
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    tableWidth: number,
    tableHeight: number,
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
      this.isAimDrag = false
      this.activePointers.clear()
      this.enableOrbitControls(true)
    }
  }

  setControls(controls: OrbitControls) {
    this.controls = controls
  }

  setMode(mode: CueInputMode) {
    this.mode = mode
    // When switching to camera mode, stop any active aim drag
    if (mode === 'camera') {
      this.isAimDrag = false
      this.state = 'idle'
      this.enableOrbitControls(true)
    } else {
      // In aim mode, OrbitControls are only active during multi-touch
      this.enableOrbitControls(false)
    }
  }

  getMode(): CueInputMode {
    return this.mode
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

  /** Called by UI shoot button */
  shoot() {
    if (this.state !== 'idle' && this.state !== 'aiming') return
    this.state = 'committed'
    this.callbacks.onShoot()
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp)
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick)
  }

  /** Reset to idle state (after shot simulation completes) */
  reset() {
    this.state = 'idle'
    this.isAimDrag = false
    this.activePointers.clear()
    if (this.mode === 'aim') {
      this.enableOrbitControls(false)
    }
  }

  private bindEvents() {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerUp)
    this.canvas.addEventListener('dblclick', this.handleDoubleClick)

    // Prevent default touch behaviors on the canvas
    this.canvas.style.touchAction = 'none'
  }

  private enableOrbitControls(enabled: boolean) {
    if (this.controls) {
      this.controls.enabled = enabled
    }
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

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // In camera mode, let OrbitControls handle everything
    if (this.mode === 'camera') return

    // Multi-touch: switch to camera control temporarily
    if (this.activePointers.size > 1) {
      this.isAimDrag = false
      this.enableOrbitControls(true)
      return
    }

    // Single touch in aim mode: start aiming
    const tablePos = this.screenToTable(e.clientX, e.clientY)
    if (!tablePos) return

    this.isAimDrag = true
    this.state = 'aiming'
    this.enableOrbitControls(false)

    // Set aim direction from cue ball to pointer
    const dx = tablePos[0] - this.cueBallPos[0]
    const dy = tablePos[1] - this.cueBallPos[1]
    this.aimDirection = Math.atan2(dy, dx)
    this.callbacks.onAimUpdate(this.aimDirection)
  }

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.enabled) return

    // Update tracked pointer position
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    // In camera mode or multi-touch, let OrbitControls handle it
    if (this.mode === 'camera' || this.activePointers.size > 1) return

    if (!this.isAimDrag) return

    const tablePos = this.screenToTable(e.clientX, e.clientY)
    if (!tablePos) return

    // Update aim direction
    const dx = tablePos[0] - this.cueBallPos[0]
    const dy = tablePos[1] - this.cueBallPos[1]
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 1) {
      this.aimDirection = Math.atan2(dy, dx)
    }

    this.callbacks.onAimUpdate(this.aimDirection)
  }

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.enabled) return

    this.activePointers.delete(e.pointerId)

    // If all fingers are up and we were in multi-touch camera, go back to aim mode
    if (this.activePointers.size === 0 && this.mode === 'aim') {
      this.enableOrbitControls(false)
    }

    // End aim drag when the aiming finger lifts
    // (but do NOT auto-shoot — the user must press the shoot button)
    if (this.isAimDrag && this.activePointers.size === 0) {
      this.isAimDrag = false
      // Stay in 'aiming' state so the preview stays visible
    }
  }

  /** Desktop convenience: double-click to shoot */
  private handleDoubleClick = (_e: MouseEvent) => {
    if (!this.enabled || this.mode !== 'aim') return
    this.shoot()
  }
}
