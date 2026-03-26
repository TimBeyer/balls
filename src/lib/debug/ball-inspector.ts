import * as THREE from 'three'
import type Ball from '../ball'

export class BallInspector {
  private selectedBallId: string | null = null
  private millimeterToPixel = 0.5
  private pointerDownPos: { x: number; y: number } | null = null

  hasSelection(): boolean {
    return this.selectedBallId !== null
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

  renderOverlay(
    ctx: CanvasRenderingContext2D,
    state: { [key: string]: Ball },
    progress: number,
  ): void {
    if (!this.selectedBallId || !state[this.selectedBallId]) {
      this.selectedBallId = null
      return
    }

    const ball = state[this.selectedBallId]
    const pos = ball.positionAtTime(progress)
    const screenX = pos[0] * this.millimeterToPixel
    const screenY = pos[1] * this.millimeterToPixel

    // Compute velocity at current time
    const dt = progress - ball.time
    const vx = ball.trajectory.b[0] + 2 * ball.trajectory.a[0] * dt
    const vy = ball.trajectory.b[1] + 2 * ball.trajectory.a[1] * dt
    const speed = Math.sqrt(vx * vx + vy * vy)

    // Build info lines
    const lines = [
      `ID: ${ball.id.substring(0, 8)}`,
      `Pos: (${pos[0].toFixed(1)}, ${pos[1].toFixed(1)})`,
      `Vel: (${vx.toFixed(1)}, ${vy.toFixed(1)})`,
      `Speed: ${speed.toFixed(1)} mm/s`,
      `AngVel: (${ball.angularVelocity[0].toFixed(1)}, ${ball.angularVelocity[1].toFixed(1)}, ${ball.angularVelocity[2].toFixed(1)})`,
      `State: ${ball.motionState}`,
      `Accel: (${ball.trajectory.a[0].toFixed(2)}, ${ball.trajectory.a[1].toFixed(2)})`,
      `R: ${ball.radius.toFixed(1)}  M: ${ball.mass.toFixed(0)}`,
      `Time: ${ball.time.toFixed(4)}`,
    ]

    const fontSize = 11
    const lineHeight = 14
    const padding = 6
    const panelWidth = 200
    const panelHeight = lines.length * lineHeight + padding * 2

    // Position panel to the right of the ball, clamped to canvas
    let panelX = screenX + ball.radius * this.millimeterToPixel + 10
    let panelY = screenY - panelHeight / 2

    const canvasWidth = ctx.canvas.width
    const canvasHeight = ctx.canvas.height
    if (panelX + panelWidth > canvasWidth) {
      panelX = screenX - ball.radius * this.millimeterToPixel - 10 - panelWidth
    }
    panelY = Math.max(4, Math.min(canvasHeight - panelHeight - 4, panelY))

    ctx.save()

    // Draw line from ball to panel
    ctx.strokeStyle = '#ffffff'
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(screenX, screenY)
    ctx.lineTo(panelX, panelY + panelHeight / 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Draw highlight ring around selected ball
    ctx.globalAlpha = 0.8
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(screenX, screenY, ball.radius * this.millimeterToPixel + 3, 0, Math.PI * 2)
    ctx.stroke()

    // Draw panel background
    ctx.globalAlpha = 0.85
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight)
    ctx.globalAlpha = 0.6
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight)

    // Draw text
    ctx.globalAlpha = 1.0
    ctx.fillStyle = '#e0e0e0'
    ctx.font = `${fontSize}px monospace`
    ctx.textBaseline = 'top'
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], panelX + padding, panelY + padding + i * lineHeight)
    }

    ctx.restore()
  }
}
