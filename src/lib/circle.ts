import * as uuid from 'uuid'
import Vector2D from './vector2d'

export default class Circle {
  constructor(
    public position: Vector2D,
    public velocity: Vector2D,
    public radius: number,
    public time: number,
    public mass: number = 100,
    public id: string = uuid.v4()
  ) {}

  get x () {
    return this.position[0]
  }

  get y () {
    return this.position[1]
  }

  toString(): string {
    const [x, y] = this.position
    const [vx, vy] = this.velocity

    return `${this.id} - P: (${x}, ${y}) R: ${this.radius}, V: (${vx}, ${vy})`
  }

  positionAtTime(time: number) : Vector2D {
    const relativeTime = time - this.time

    return [
      this.position[0] + (this.velocity[0] * relativeTime),
      this.position[1] + (this.velocity[1] * relativeTime),
    ]
  }

  /**
   * Advances the circle to a certain point in absolute time
   * Since the velocity vector may change afterwards,
   * and thus the new collisions are calculated relative to that point in time
   * we internally record how much time has already elapsed for 
   * this circle and only move it by the relative amount when advancing the absolute value
   * @param time 
   */
  advanceTime(time: number) : this {
    const relativeTime = time - this.time

    this.position[0] = this.position[0] + this.velocity[0] * relativeTime
    this.position[1] = this.position[1] + this.velocity[1] * relativeTime
    
    this.time = time

    return this
  }

}