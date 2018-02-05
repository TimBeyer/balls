import { WorkerRequest, WorkerSimulationRequest, isWorkerInitializationRequest, isWorkerSimulationRequest } from "./worker-request";
import { WorkerInitializationResponse, ResponseMessageType, WorkerSimulationResponse } from "./worker-response";
import Circle from "./circle";
import { simulate } from "./simulation";

const ctx: Worker = self as any;

let isInitialized = false
let TABLE_HEIGHT, TABLE_WIDTH, NUM_BALLS
let circles = [];
let time = 0

const randomCircle = function () {
  const radius = 37.5

  const x = (Math.random() * (TABLE_WIDTH - 2 * radius)) + radius;
  const y = (Math.random() * (TABLE_HEIGHT - 2 * radius)) + radius;

  const velocity: [number, number] = [Math.random() * 0.7 - Math.random() * 1.4, Math.random() * 0.7  - Math.random() * 1.4]
  return new Circle([x, y], velocity, radius, 0)
}

const circlesCollide = function (c1: Circle, c2: Circle): boolean {
  const distance = Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2))
  return distance <= (c1.radius + c2.radius)
}


// Respond to message from parent thread
ctx.addEventListener('message', (event) => {
  const request: WorkerSimulationRequest = event.data
  console.log(request)

  if (isWorkerInitializationRequest(request)) {
    if (isInitialized) {
      const response: WorkerInitializationResponse = {
        type: ResponseMessageType.SIMULATION_INITIALIZED,
        payload: {
          status: false,
          tableWidth: request.payload.tableWidth,
          tableHeight: request.payload.tableHeight,
          numBalls: request.payload.numBalls
        }
      }
      ctx.postMessage(response)
    } else {
      TABLE_HEIGHT = request.payload.tableHeight
      TABLE_WIDTH = request.payload.tableWidth
      NUM_BALLS = request.payload.numBalls

      console.time('initCircles')
      // just brute force random generate a couple of non-overlapping circles instead of doing some fancy maths
      while (circles.length <= NUM_BALLS) {
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
      console.timeEnd('initCircles')
      const response: WorkerInitializationResponse = {
        type: ResponseMessageType.SIMULATION_INITIALIZED,
        payload: {
          status: true,
          tableWidth: request.payload.tableWidth,
          tableHeight: request.payload.tableHeight,
          numBalls: request.payload.numBalls
        }
      }
      ctx.postMessage(response)
    }
    console.log('Worker', request.payload)
  } else if (isWorkerSimulationRequest(request)) {
    let needsInitialValues = time === 0

    time = time + request.payload.time
    console.log(`Simulating ${NUM_BALLS} balls for ${request.payload.time / 1000} seconds`)
    console.time('simulate')
    if (needsInitialValues) {
      const simulatedResults = simulate(TABLE_WIDTH, TABLE_HEIGHT, time, circles);
      const initialValues = simulatedResults.shift()
      const response: WorkerSimulationResponse = {
        type: ResponseMessageType.SIMULATION_DATA,
        payload: {
          initialValues,
          data: simulatedResults
        }
      }
      console.timeEnd('simulate')
      ctx.postMessage(response)
    } else {
      const simulatedResults = simulate(TABLE_WIDTH, TABLE_HEIGHT, time, circles);
      const response: WorkerSimulationResponse = {
        type: ResponseMessageType.SIMULATION_DATA,
        payload: {
          data: simulatedResults
        }
      }
      console.timeEnd('simulate')
      ctx.postMessage(response)
    }
  }
});