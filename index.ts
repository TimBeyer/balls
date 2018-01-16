import Circle from './lib/circle'

const circle = new Circle({ x: 10, y: 10 }, 5)

console.log(circle.toString())

const collisionTimes = function (posA: number[], velocityA: number[], radiusA: number, posB: number[], velocityB: number[], radiusB: number): number[]  {
  // first calculate relative velocity 
  const v = [velocityA[0] - velocityB[0], velocityA[1] - velocityB[1]]
  // then relative position
  const pos = [posA[0] - posB[0], posA[1] - posB[1]]

  // preparing for `ax^2 + bx + x = 0` solution

  // a = (vx^2 + vy^2)
  const a = Math.pow(v[0], 2) + Math.pow(v[1], 2)
  // b = 2 (a*vx + b*vy)
  const b = 2 * (pos[0] * v[0] + pos[1] * v[1])
  // c = a^2 + b^2 - (r1 + r2) ^ 2
  const c = Math.pow(pos[0], 2) + Math.pow(pos[1], 2) - Math.pow(radiusA + radiusB, 2)

  // the part +- sqrt(b^2 - 4ac)
  const variablePart = Math.sqrt(Math.pow(b, 2) - 4 * a * c)
  const belowDivision = 2 * a
  
  return [
    (-b + variablePart) / belowDivision,
    (-b - variablePart) / belowDivision
  ]
}

console.log(collisionTimes(
  [1, 1],
  [1, 0],
  1,
  [9, 1],
  [-1, 0],
  1
))