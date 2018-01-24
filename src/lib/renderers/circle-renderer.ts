import Renderer from "./renderer";
import Circle from "../circle";
import { ReplayData } from "../simulation";
import stringToRGB from "../string-to-rgb";


export default class CircleRenderer extends Renderer {
  constructor(canvas: HTMLCanvasElement) {
    super(canvas)
  }

  render(circle: Circle, progress: number, nextEvent: ReplayData) {
    if (nextEvent) {}
    const position = circle.positionAtTime(progress)
    const screenPos = this.toScreenCoords(position)

    this.ctx.strokeStyle = '#000000'
    this.ctx.fillStyle = stringToRGB(circle.id)

    const nextCircleIds = nextEvent.snapshots.map((snapshot) => snapshot.id)
    this.ctx.beginPath()
    this.ctx.arc(screenPos[0], screenPos[1], circle.radius * this.millimeterToPixel, 0, Math.PI * 2)
    this.ctx.closePath()
    this.ctx.fill()

    if (nextCircleIds.includes(circle.id)) {
      this.ctx.fillStyle = '#ff0000'
      this.ctx.beginPath()    
      this.ctx.arc(screenPos[0], screenPos[1], circle.radius / 2 * this.millimeterToPixel, 0, Math.PI * 2)
      this.ctx.closePath()
      this.ctx.fill()
    }

    this.ctx.beginPath()    
    this.ctx.arc(screenPos[0], screenPos[1], circle.radius * this.millimeterToPixel, 0, Math.PI * 2)
    this.ctx.stroke()
    // Draw UUID
    // this.ctx.fillText(circle.id, screenPos[0], screenPos[1])
  }
}