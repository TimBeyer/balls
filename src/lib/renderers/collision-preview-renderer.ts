import Renderer from "./renderer";
import Circle from "../circle";
import { ReplayData } from "../simulation";
import stringToRGB from "../string-to-rgb";


export default class CollisionPreviewRenderer extends Renderer {
  private numCollisions: number

  constructor(canvas: HTMLCanvasElement, numCollisions: number) {
    super(canvas)
    this.numCollisions = numCollisions
  }

  render(circle: Circle, _progress: number, _nextEvent: ReplayData, remainingEvents: ReplayData[]) {


    for (var i = 0; i < this.numCollisions; i++) {
      const nextEvent = remainingEvents[i]
      if (remainingEvents) {
        const nextCircleIds = nextEvent.snapshots.map((snapshot) => snapshot.id)
  
        if (nextCircleIds.includes(circle.id)) {
          this.ctx.strokeStyle = stringToRGB(circle.id)
  
          const snapshotCollisionPosition = this.toScreenCoords(nextEvent.snapshots.find((snapshot) => snapshot.id === circle.id).position)
  
          // Draw line to snapshotted position 
  
          // Draw collision circle
          this.ctx.beginPath()
          this.ctx.strokeStyle = stringToRGB(circle.id)
          this.ctx.arc(snapshotCollisionPosition[0], snapshotCollisionPosition[1], circle.radius * this.millimeterToPixel, 0, Math.PI * 2)
          this.ctx.closePath()
          this.ctx.stroke()
        }

      }
    }
  }
}