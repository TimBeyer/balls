import { isWorkerInitializationRequest, isWorkerSimulationRequest, isWorkerScenarioRequest } from './worker-request'
import { ResponseMessageType, WorkerInitializationResponse, WorkerSimulationResponse } from './worker-response'
import { generateCircles } from './generate-circles'
import { simulate } from './simulation'
import Ball from './ball'
import { defaultPhysicsConfig, zeroFrictionConfig, PhysicsConfig } from './physics-config'
import { createPoolPhysicsProfile, createSimple2DProfile } from './physics/physics-profile'
import type { PhysicsProfile } from './physics/physics-profile'
import type { PhysicsProfileName, PhysicsOverrides } from './config'
import type { Scenario, BallSpec } from './scenarios'
import type { TableConfig } from './table-config'
import { createPoolTable, createSnookerTable } from './table-config'

declare const self: DedicatedWorkerGlobalScope

function applyPhysicsOverrides(base: PhysicsConfig, overrides?: PhysicsOverrides): PhysicsConfig {
  if (!overrides || Object.keys(overrides).length === 0) return base
  const params = { ...base.defaultBallParams }
  if (overrides.muSliding !== undefined) params.muSliding = overrides.muSliding
  if (overrides.muRolling !== undefined) params.muRolling = overrides.muRolling
  if (overrides.muSpinning !== undefined) params.muSpinning = overrides.muSpinning
  if (overrides.eBallBall !== undefined) params.eBallBall = overrides.eBallBall
  if (overrides.eRestitution !== undefined) params.eRestitution = overrides.eRestitution
  return {
    ...base,
    gravity: overrides.gravity ?? base.gravity,
    defaultBallParams: params,
  }
}

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
let tableConfig: TableConfig | undefined

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
      physicsConfig = applyPhysicsOverrides(defaultPhysicsConfig, request.payload.physicsOverrides)
      tableConfig = request.payload.tableConfig

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

    // Resolve table config from scenario table type
    if (scenario.tableType === 'pool') {
      tableConfig = createPoolTable()
    } else if (scenario.tableType === 'snooker') {
      tableConfig = createSnookerTable()
    } else {
      tableConfig = undefined // sandbox mode — no pockets
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
    const simOptions = tableConfig ? { tableConfig } : undefined
    if (needsInitialValues) {
      const simulatedResults = simulate(TABLE_WIDTH, TABLE_HEIGHT, time, circles, physicsConfig, profile, simOptions)
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
      const simulatedResults = simulate(TABLE_WIDTH, TABLE_HEIGHT, time, circles, physicsConfig, profile, simOptions)
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
