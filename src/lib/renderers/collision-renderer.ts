import Renderer from "./renderer";
import Circle from "../circle";
import { ReplayData } from "../simulation";
import stringToRGB from "../string-to-rgb";


export default class CollisionRenderer extends Renderer {
  constructor(canvas: HTMLCanvasElement) {
    super(canvas)
  }

  render(circle: Circle, progress: number, nextEvent: ReplayData) {
    const nextCircleIds = nextEvent.snapshots.map((snapshot) => snapshot.id)

    const position = this.toScreenCoords(circle.positionAtTime(progress))

    if (nextCircleIds.includes(circle.id)) {
      this.ctx.strokeStyle = stringToRGB(circle.id)

      const snapshotCollisionPosition = this.toScreenCoords(nextEvent.snapshots.find((snapshot) => snapshot.id === circle.id).position)

      // Draw collision circle
      this.ctx.beginPath()
      this.ctx.arc(snapshotCollisionPosition[0], snapshotCollisionPosition[1] , circle.radius * this.millimeterToPixel, 0, Math.PI * 2)
      this.ctx.closePath()
      this.ctx.stroke()

      // Draw collision circle
      this.ctx.beginPath()
      this.ctx.strokeStyle = stringToRGB(circle.id)
      this.ctx.arc(snapshotCollisionPosition[0], snapshotCollisionPosition[1], circle.radius * this.millimeterToPixel, 0, Math.PI * 2)
      this.ctx.closePath()
      this.ctx.stroke()

      // Draw line to collision position
      this.ctx.beginPath()
      this.ctx.strokeStyle = stringToRGB(circle.id)
      this.ctx.moveTo(position[0], position[1])
      this.ctx.lineTo(snapshotCollisionPosition[0], snapshotCollisionPosition[1])
      this.ctx.closePath()
      this.ctx.stroke()
    } 
  }
}