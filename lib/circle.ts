import Vector2D from './vector2d'

export default class Circle {
  constructor(public position: Vector2D, public velocity: Vector2D, public radius: number) { }

  toString(): string {
    const [x, y] = this.position
    const [vx, vy] = this.velocity

    return `P: (${x}, ${y}) R: ${this.radius}, V: (${x}, ${y})`
  }

}