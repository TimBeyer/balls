import { isWorkerInitializationRequest, isWorkerSimulationRequest } from './worker-request'
import { ResponseMessageType, WorkerInitializationResponse, WorkerSimulationResponse } from './worker-response'
import { generateCircles } from './generate-circles'
import { simulate } from './simulation'
import type Ball from './ball'
import { defaultPhysicsConfig, PhysicsConfig } from './physics-config'
import { createPoolPhysicsProfile, createSimple2DProfile } from './physics/physics-profile'
import type { PhysicsProfile } from './physics/physics-profile'
import type { PhysicsProfileName } from './config'

declare const self: DedicatedWorkerGlobalScope

function createProfileByName(name: PhysicsProfileName): PhysicsProfile {
  switch (name) {
    case 'simple2d':
      return createSimple2DProfile()
    case 'pool':
    default:
      return createPoolPhysicsProfile()
  }
}

let isInitialized = false
let TABLE_HEIGHT = 0
let TABLE_WIDTH = 0
let NUM_BALLS = 0
let circles: Ball[] = []
let time = 0
const physicsConfig: PhysicsConfig = defaultPhysicsConfig
let profile: PhysicsProfile = createPoolPhysicsProfile()

// Respond to message from parent thread
self.addEventListener('message', (event: MessageEvent) => {
  const request = event.data
  console.log(request)

  if (isWorkerInitializationRequest(request)) {
    if (isInitialized) {
      const response: WorkerInitializationResponse = {
        type: ResponseMessageType.SIMULATION_INITIALIZED,
        payload: {
          status: false,
          tableWidth: request.payload.tableWidth,
          tableHeight: request.payload.tableHeight,
          numBalls: request.payload.numBalls,
        },
      }
      self.postMessage(response)
    } else {
      TABLE_HEIGHT = request.payload.tableHeight
      TABLE_WIDTH = request.payload.tableWidth
      NUM_BALLS = request.payload.numBalls
      profile = createProfileByName(request.payload.physicsProfile)

      console.time('initCircles')
      circles = generateCircles(NUM_BALLS, TABLE_WIDTH, TABLE_HEIGHT, Math.random, physicsConfig, profile)
      console.timeEnd('initCircles')
      isInitialized = true
      const response: WorkerInitializationResponse = {
        type: ResponseMessageType.SIMULATION_INITIALIZED,
        payload: {
          status: true,
          tableWidth: request.payload.tableWidth,
          tableHeight: request.payload.tableHeight,
          numBalls: request.payload.numBalls,
        },
      }
      self.postMessage(response)
    }
    console.log('Worker', request.payload)
  } else if (isWorkerSimulationRequest(request)) {
    const needsInitialValues = time === 0

    time = time + request.payload.time
    console.log(`Simulating ${NUM_BALLS} balls for ${request.payload.time / 1000} seconds`)
    console.time('simulate')
    if (needsInitialValues) {
      const simulatedResults = simulate(TABLE_WIDTH, TABLE_HEIGHT, time, circles, physicsConfig, profile)
      const initialValues = simulatedResults.shift()
      const response: WorkerSimulationResponse = {
        type: ResponseMessageType.SIMULATION_DATA,
        payload: {
          initialValues,
          data: simulatedResults,
        },
      }
      console.timeEnd('simulate')
      self.postMessage(response)
    } else {
      const simulatedResults = simulate(TABLE_WIDTH, TABLE_HEIGHT, time, circles, physicsConfig, profile)
      const response: WorkerSimulationResponse = {
        type: ResponseMessageType.SIMULATION_DATA,
        payload: {
          data: simulatedResults,
        },
      }
      console.timeEnd('simulate')
      self.postMessage(response)
    }
  }
})
