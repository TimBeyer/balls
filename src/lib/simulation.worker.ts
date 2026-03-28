import { isWorkerInitializationRequest, isWorkerSimulationRequest, isWorkerScenarioRequest } from './worker-request'
import { ResponseMessageType, WorkerInitializationResponse, WorkerSimulationResponse } from './worker-response'
import { generateCircles } from './generate-circles'
import { simulate } from './simulation'
import Ball from './ball'
import { defaultPhysicsConfig, zeroFrictionConfig, PhysicsConfig } from './physics-config'
import { createPoolPhysicsProfile, createSimple2DProfile } from './physics/physics-profile'
import type { PhysicsProfile } from './physics/physics-profile'
import type { PhysicsProfileName } from './config'
import type { Scenario, BallSpec } from './scenarios'

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

function createBallFromSpec(spec: BallSpec, physicsConfig: PhysicsConfig): Ball {
  const R = physicsConfig.defaultBallParams.radius
  return new Ball(
    [spec.x, spec.y, 0],
    [spec.vx ?? 0, spec.vy ?? 0, spec.vz ?? 0],
    R,
    0,
    physicsConfig.defaultBallParams.mass,
    spec.id,
    spec.spin ? [...spec.spin] : [0, 0, 0],
    { ...physicsConfig.defaultBallParams },
    physicsConfig,
  )
}

function createBallsFromScenario(scenario: Scenario, physicsConfig: PhysicsConfig, profile: PhysicsProfile): Ball[] {
  const balls = scenario.balls.map((spec) => createBallFromSpec(spec, physicsConfig))
  for (const ball of balls) {
    ball.updateTrajectory(profile, physicsConfig)
  }
  return balls
}

let isInitialized = false
let TABLE_HEIGHT = 0
let TABLE_WIDTH = 0
let NUM_BALLS = 0
let circles: Ball[] = []
let time = 0
let physicsConfig: PhysicsConfig = defaultPhysicsConfig
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
  } else if (isWorkerScenarioRequest(request)) {
    const scenario = request.payload.scenario

    TABLE_WIDTH = scenario.table.width
    TABLE_HEIGHT = scenario.table.height

    // Determine physics profile and config from scenario
    if (scenario.physics === 'zero-friction') {
      profile = createSimple2DProfile()
      physicsConfig = zeroFrictionConfig
    } else if (scenario.physics === 'simple2d') {
      profile = createSimple2DProfile()
      physicsConfig = defaultPhysicsConfig
    } else {
      profile = createPoolPhysicsProfile()
      physicsConfig = defaultPhysicsConfig
    }

    circles = createBallsFromScenario(scenario, physicsConfig, profile)
    NUM_BALLS = circles.length
    isInitialized = true
    time = 0

    const response: WorkerInitializationResponse = {
      type: ResponseMessageType.SIMULATION_INITIALIZED,
      payload: {
        status: true,
        tableWidth: TABLE_WIDTH,
        tableHeight: TABLE_HEIGHT,
        numBalls: NUM_BALLS,
      },
    }
    self.postMessage(response)
    console.log('Worker: loaded scenario', scenario.name, `(${NUM_BALLS} balls)`)
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
