export type PhysicsProfileName = 'pool' | 'simple2d'

export interface SimulationConfig {
  // Simulation (restart required)
  numBalls: number
  tableWidth: number
  tableHeight: number
  physicsProfile: PhysicsProfileName

  // 3D Rendering
  shadowsEnabled: boolean
  shadowMapSize: number
  ballRoughness: number
  ballSegments: number

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
}

export const defaultConfig: SimulationConfig = {
  numBalls: 150,
  tableWidth: 2840,
  tableHeight: 1420,
  physicsProfile: 'pool',

  shadowsEnabled: true,
  shadowMapSize: 1024,
  ballRoughness: 0,
  ballSegments: 32,

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
}

export function createConfig(): SimulationConfig {
  return { ...defaultConfig }
}
