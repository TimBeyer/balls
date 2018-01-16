interface Vector2D {
  x: number,
  y: number
}

export default class Circle {
  constructor(private position: Vector2D, private radius: number) { }

  toString(): string {
    const { x, y } = this.position
    return `(${x}, ${y}) R: ${this.radius}`
  }

}