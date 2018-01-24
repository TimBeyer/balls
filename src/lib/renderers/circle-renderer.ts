import Renderer from "./renderer";
import Circle from "../circle";
import { ReplayData } from "../simulation";
import stringToRGB from "../string-to-rgb";


export default class CircleRenderer extends Renderer {
  constructor(canvas: HTMLCanvasElement) {
    super(canvas)
  }

  render(circle: Circle, progress: number, nextEvent: ReplayData) {
    const position = circle.positionAtTime(progress)

    this.ctx.strokeStyle = '#000000'

    const nextCircleIds = nextEvent.snapshots.map((snapshot) => snapshot.id)
    this.ctx.beginPath()
    if (nextCircleIds.includes(circle.id)) {
      this.ctx.fillStyle = '#ff0000'
    } else {
      this.ctx.fillStyle = stringToRGB(circle.id)
    }
    const screenPos = this.toScreenCoords(position)
    this.ctx.arc(screenPos[0], screenPos[1], circle.radius * this.millimeterToPixel, 0, Math.PI * 2)
    this.ctx.closePath()
    this.ctx.stroke()
    this.ctx.fill()
    this.ctx.fillText(circle.id, screenPos[0], screenPos[1])
  }
}