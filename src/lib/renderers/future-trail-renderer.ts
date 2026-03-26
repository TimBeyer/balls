import Renderer from './renderer'
import Circle from '../circle'
import { EventType, ReplayData, CircleSnapshot } from '../simulation'

const EVENT_STYLES: Record<EventType, { color: string; dash: number[]; width: number }> = {
  [EventType.CircleCollision]: { color: '#E63946', dash: [], width: 2 },
  [EventType.CushionCollision]: { color: '#457B9D', dash: [8, 4], width: 2 },
  [EventType.StateTransition]: { color: '#2A9D8F', dash: [2, 4], width: 2 },
  [EventType.StateUpdate]: { color: '#E9C46A', dash: [8, 4, 2, 4], width: 1.5 },
}

interface BallEvent {
  event: ReplayData
  snapshot: CircleSnapshot
}

export default class FutureTrailRenderer extends Renderer {
  private maxEvents: number
  private interpolationSteps: number
  private phantomOpacity: number
  private showPhantoms: boolean

  constructor(
    canvas: HTMLCanvasElement,
    maxEvents: number,
    interpolationSteps: number,
    phantomOpacity: number,
    showPhantoms: boolean,
  ) {
    super(canvas)
    this.maxEvents = maxEvents
    this.interpolationSteps = interpolationSteps
    this.phantomOpacity = phantomOpacity
    this.showPhantoms = showPhantoms
  }

  updateSettings(maxEvents: number, interpolationSteps: number, phantomOpacity: number, showPhantoms: boolean): void {
    this.maxEvents = maxEvents
    this.interpolationSteps = interpolationSteps
    this.phantomOpacity = phantomOpacity
    this.showPhantoms = showPhantoms
  }

  render(circle: Circle, progress: number, _nextEvent: ReplayData, remainingEvents: ReplayData[]): void {
    // Collect the first N events that involve this ball
    const ballEvents: BallEvent[] = []
    for (const event of remainingEvents) {
      if (ballEvents.length >= this.maxEvents) break
      const snapshot = event.snapshots.find((s) => s.id === circle.id)
      if (snapshot) {
        ballEvents.push({ event, snapshot })
      }
    }

    if (ballEvents.length === 0) return

    // Draw segments: current position → event 1 → event 2 → ...
    // First segment uses the ball's current trajectory
    let segStartPos = circle.positionAtTime(progress)
    let segStartVel: [number, number] = [circle.velocity[0], circle.velocity[1]]
    let segStartAcc: [number, number] = [circle.trajectory.a[0], circle.trajectory.a[1]]
    let segStartTime = circle.time

    // Recompute velocity at current progress for the first segment
    const dt0 = progress - circle.time
    if (dt0 > 0) {
      segStartVel = [
        circle.trajectory.b[0] + 2 * circle.trajectory.a[0] * dt0,
        circle.trajectory.b[1] + 2 * circle.trajectory.a[1] * dt0,
      ]
      segStartTime = progress
    }

    for (const { event, snapshot } of ballEvents) {
      const style = EVENT_STYLES[event.type]
      const segEndTime = event.time
      const segDuration = segEndTime - segStartTime

      if (segDuration > 0) {
        this.drawTrajectorySegment(segStartPos, segStartVel, segStartAcc, segDuration, style)
      }

      // Draw phantom ball at event point
      if (this.showPhantoms) {
        this.drawPhantomBall(snapshot.position, circle.radius, style.color)
      }

      // Next segment starts from this event's snapshot
      segStartPos = [snapshot.position[0], snapshot.position[1]]
      segStartVel = [snapshot.velocity[0], snapshot.velocity[1]]
      segStartAcc = [snapshot.trajectoryA[0], snapshot.trajectoryA[1]]
      segStartTime = snapshot.time
    }
  }

  private drawTrajectorySegment(
    startPos: [number, number],
    startVel: [number, number],
    acc: [number, number],
    duration: number,
    style: { color: string; dash: number[]; width: number },
  ): void {
    const ctx = this.ctx
    const steps = this.interpolationSteps

    ctx.save()
    ctx.strokeStyle = style.color
    ctx.setLineDash(style.dash)
    ctx.lineWidth = style.width
    ctx.globalAlpha = 0.7

    ctx.beginPath()
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * duration
      const x = (acc[0] * t * t + startVel[0] * t + startPos[0]) * this.millimeterToPixel
      const y = (acc[1] * t * t + startVel[1] * t + startPos[1]) * this.millimeterToPixel

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
    ctx.restore()
  }

  private drawPhantomBall(position: [number, number] | number[], radius: number, color: string): void {
    const ctx = this.ctx
    const screenPos = this.toScreenCoords(position)
    const screenRadius = radius * this.millimeterToPixel

    ctx.save()
    ctx.globalAlpha = this.phantomOpacity
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(screenPos[0], screenPos[1], screenRadius, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 0.8
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }
}
