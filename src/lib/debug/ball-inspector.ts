import * as THREE from 'three'
import type Ball from '../ball'

export class BallInspector {
  private selectedBallId: string | null = null
  private pointerDownPos: { x: number; y: number } | null = null

  hasSelection(): boolean {
    return this.selectedBallId !== null
  }

  getSelectedBallId(): string | null {
    return this.selectedBallId
  }

  clearSelection(): void {
    this.selectedBallId = null
  }

  handlePointerDown(event: PointerEvent): void {
    this.pointerDownPos = { x: event.clientX, y: event.clientY }
  }

  handlePointerUp(
    event: PointerEvent,
    state: { [key: string]: Ball },
    circleIds: string[],
    progress: number,
    camera: THREE.Camera,
    rendererDom: HTMLElement,
    tableWidth: number,
    tableHeight: number,
  ): void {
    if (!this.pointerDownPos) return

    // Only treat as click if pointer didn't move much (distinguish from camera drag)
    const dx = event.clientX - this.pointerDownPos.x
    const dy = event.clientY - this.pointerDownPos.y
    if (dx * dx + dy * dy > 25) {
      this.pointerDownPos = null
      return
    }
    this.pointerDownPos = null

    // Raycast to find intersection with table plane (y=0 in 3D)
    const rect = rendererDom.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, camera)

    // Intersect with horizontal plane at y = ballRadius (approximate table surface)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const intersection = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(plane, intersection)) {
      this.selectedBallId = null
      return
    }

    // Convert 3D world coords to physics coords
    const physX = intersection.x + tableWidth / 2
    const physY = intersection.z + tableHeight / 2

    // Find closest ball within its radius
    let closestId: string | null = null
    let closestDist = Infinity
    for (const id of circleIds) {
      const ball = state[id]
      const pos = ball.positionAtTime(progress)
      const bx = pos[0] - physX
      const by = pos[1] - physY
      const dist = Math.sqrt(bx * bx + by * by)
      if (dist < ball.radius && dist < closestDist) {
        closestDist = dist
        closestId = id
      }
    }

    this.selectedBallId = closestId
  }
}
