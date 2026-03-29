import type { BallTextureSet } from './scene/ball-textures'

export type PhysicsProfileName = 'pool' | 'simple2d'

export interface PhysicsOverrides {
  gravity?: number // mm/s² (default 9810)
  muSliding?: number // sliding friction (default 0.2)
  muRolling?: number // rolling friction (default 0.01)
  muSpinning?: number // spinning friction (default 0.044)
  eBallBall?: number // ball-ball restitution (default 0.93)
  eRestitution?: number // cushion restitution (default 0.85)
}

export interface SimulationConfig {
  // Simulation (restart required)
  numBalls: number
  tableWidth: number
  tableHeight: number
  physicsProfile: PhysicsProfileName
  scenarioName: string // '' = random, otherwise a scenario name from scenarios.ts
  physicsOverrides: PhysicsOverrides

  // 3D Rendering
  shadowsEnabled: boolean
  shadowMapSize: number
  ballRoughness: number
  ballSegments: number
  ballTextureSet: BallTextureSet
  ballRotationEnabled: boolean

  // Lighting
  lightIntensity: number
  lightHeight: number
  lightAngle: number
  lightPenumbra: number
  lightDecay: number

  // Camera
  fov: number

  // 2D Overlay renderers
  showCircles: boolean
  showTails: boolean
  tailLength: number
  showCollisions: boolean
  showCollisionPreview: boolean
  collisionPreviewCount: number

  // Table
  tableColor: string

  // Performance
  showStats: boolean

  // Simulation speed
  simulationSpeed: number

  // Debug Visualization
  showFutureTrails: boolean
  futureTrailEventsPerBall: number
  futureTrailInterpolationSteps: number
  showPhantomBalls: boolean
  phantomBallOpacity: number
  showBallInspector: boolean
}

export const defaultConfig: SimulationConfig = {
  numBalls: 150,
  tableWidth: 2840,
  tableHeight: 1420,
  physicsProfile: 'pool',
  scenarioName: '',
  physicsOverrides: {},

  shadowsEnabled: true,
  shadowMapSize: 1024,
  ballRoughness: 0,
  ballSegments: 32,
  ballTextureSet: 'american',
  ballRotationEnabled: true,

  lightIntensity: 1,
  lightHeight: 1200,
  lightAngle: 0.9,
  lightPenumbra: 0.6,
  lightDecay: 0.1,

  fov: 60,

  showCircles: true,
  showTails: false,
  tailLength: 50,
  showCollisions: false,
  showCollisionPreview: false,
  collisionPreviewCount: 5,

  tableColor: '#777777',

  showStats: true,

  simulationSpeed: 1.0,

  showFutureTrails: false,
  futureTrailEventsPerBall: 5,
  futureTrailInterpolationSteps: 10,
  showPhantomBalls: true,
  phantomBallOpacity: 0.3,
  showBallInspector: false,
}

export function createConfig(): SimulationConfig {
  return { ...defaultConfig }
}
