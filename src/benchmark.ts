import Circle from './lib/circle'
import { simulate } from './lib/simulation';

import * as Benchmark from 'benchmark'

// Measurements in millimeters
const TABLE_WIDTH = 2840
const TABLE_HEIGHT = 1420

const millimeterToPixel = 1 / 2
const CANVAS_WIDTH = TABLE_WIDTH * millimeterToPixel
const CANVAS_HEIGHT = TABLE_HEIGHT * millimeterToPixel

const randomCircle = function () {
  const radius = 37.5

  const x = (Math.random() * (TABLE_WIDTH - 2 * radius)) + radius;
  const y = (Math.random() * (TABLE_HEIGHT - 2 * radius)) + radius;

  const velocity: [number, number] = [Math.random() * 0.8, Math.random() * 0.8]
  return new Circle([x, y], velocity, radius, 0)

}

const simulateRandomCircles = function (numCircles: number) {
  let circles = [];

  const circlesCollide = function (c1: Circle, c2: Circle): boolean {
    const distance = Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2))
    return distance <= (c1.radius + c2.radius)
  }

  // just brute force random generate a couple of non-overlapping circles instead of doing some fancy maths
  while (circles.length <= numCircles) {
    let currentCircle = randomCircle()
    let circleCollides = circles.some((circle) => circlesCollide(circle, currentCircle))
    let attemptCount = 1
    while (circleCollides) {
      attemptCount += 1
      currentCircle = randomCircle()
      circleCollides = circles.some((circle) => circlesCollide(circle, currentCircle))

      if (attemptCount > 5000) {
        circles = []
        attemptCount = 0
      }
    }

    circles.push(currentCircle)
  }

  simulate(TABLE_WIDTH, TABLE_HEIGHT, 120000, circles);
}

var suite = new Benchmark.Suite;

// add tests
suite.add('10 Circles', function () {
  simulateRandomCircles(10)
})
.add('20 Circles', function () {
  simulateRandomCircles(20)
})
// add listeners
.on('cycle', function (event) {
  console.log(String(event.target));
})
.on('complete', function () {
  console.log('Fastest is ' + this.filter('fastest').map('name'));
})
// run async
.run({ 'async': true });