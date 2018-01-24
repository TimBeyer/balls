import Renderer from "./renderer";
import Circle from "../circle";


export default class TailRenderer extends Renderer {
  private tailLength: number
  private eventsTail: Map<Circle, number[][]> = new Map()

  constructor(canvas: HTMLCanvasElement, tailLength: number) {
    super(canvas)
    this.tailLength = tailLength
  }

  render(circle: Circle, progress: number) {
    if (!this.eventsTail.has(circle)) {
      this.eventsTail.set(circle, [])
    }
    
    const position = circle.positionAtTime(progress)
    const tail = this.eventsTail.get(circle)
    tail.push(position)
    
    if (tail.length > this.tailLength) {
      tail.shift()
    }
    
    let prev = tail[0]
    let prevScreen = this.toScreenCoords(prev)
        
    for (const position of tail) {
      let posScreen = this.toScreenCoords(position)

      this.ctx.beginPath()
      this.ctx.moveTo(prevScreen[0], prevScreen[1])

      if (Math.sqrt(Math.pow(position[0] - prev[0], 2) + Math.pow(position[1] - prev[1], 2)) > 100) {
        this.ctx.strokeStyle = '#ff0000'
      } else {
        this.ctx.strokeStyle = '#000000'
      }
      this.ctx.lineTo(posScreen[0], posScreen[1])
      prev = position
      prevScreen = this.toScreenCoords(position)

      this.ctx.stroke()
    }
  }
}