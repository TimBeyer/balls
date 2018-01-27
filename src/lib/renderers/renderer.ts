import Circle from "../circle";
import { ReplayData } from "../simulation";


export default abstract class Renderer {
  protected ctx: CanvasRenderingContext2D
  protected canvas: HTMLCanvasElement
  protected width: number
  protected height: number
  protected millimeterToPixel = 1 / 2


  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.width = canvas.width
    this.height = canvas.height
  }

  abstract render(circle: Circle, progress: number, nextEvent: ReplayData, remainingEvents: ReplayData[])

  protected toScreenCoords (coord: number[]): number[] {
    return [coord[0] * this.millimeterToPixel, coord[1] * this.millimeterToPixel]
  }
}