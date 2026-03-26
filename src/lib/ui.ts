import { Pane } from 'tweakpane'
import { SimulationConfig } from './config'
import { allScenarios } from './scenarios'

export interface UICallbacks {
  onRestartRequired: () => void
  onLiveUpdate: () => void
  onPauseToggle: () => void
  onStepForward: () => void
}

export function createUI(config: SimulationConfig, callbacks: UICallbacks): Pane {
  const pane = new Pane({ title: 'Simulation Controls' })

  // --- Simulation (restart required) ---
  const simFolder = pane.addFolder({ title: 'Simulation (restart to apply)' })
  // Build scenario options: { '(Random)': '', 'name': 'name', ... }
  const scenarioOptions: Record<string, string> = { '(Random)': '' }
  for (const s of allScenarios) {
    scenarioOptions[s.name] = s.name
  }
  simFolder.addBinding(config, 'scenarioName', { label: 'Scenario', options: scenarioOptions })
  simFolder.addBinding(config, 'physicsProfile', {
    label: 'Physics',
    options: { 'Pool (3D friction)': 'pool', 'Simple 2D': 'simple2d' },
  })
  simFolder.addBinding(config, 'numBalls', { min: 1, max: 500, step: 1, label: 'Balls' })
  simFolder.addBinding(config, 'tableWidth', { min: 500, max: 5000, step: 10, label: 'Table Width' })
  simFolder.addBinding(config, 'tableHeight', { min: 500, max: 3000, step: 10, label: 'Table Height' })
  simFolder.addButton({ title: 'Restart Simulation' }).on('click', () => {
    callbacks.onRestartRequired()
  })

  // --- Simulation Speed ---
  pane.addBinding(config, 'simulationSpeed', { min: 0.1, max: 5, step: 0.1, label: 'Speed' })

  // --- 3D Rendering ---
  const renderFolder = pane.addFolder({ title: '3D Rendering' })
  renderFolder.addBinding(config, 'shadowsEnabled', { label: 'Shadows' })
    .on('change', () => callbacks.onLiveUpdate())
  renderFolder.addBinding(config, 'shadowMapSize', {
    label: 'Shadow Quality',
    options: { Low: 256, Medium: 512, High: 1024, Ultra: 2048 },
  }).on('change', () => callbacks.onLiveUpdate())
  renderFolder.addBinding(config, 'ballRoughness', { min: 0, max: 1, step: 0.05, label: 'Ball Roughness' })
    .on('change', () => callbacks.onLiveUpdate())
  renderFolder.addBinding(config, 'ballSegments', {
    label: 'Ball Detail',
    options: { Low: 8, Medium: 16, High: 32, Ultra: 64 },
  }).on('change', () => callbacks.onRestartRequired())

  // --- Lighting ---
  const lightFolder = pane.addFolder({ title: 'Lighting' })
  lightFolder.addBinding(config, 'lightIntensity', { min: 0, max: 5, step: 0.1, label: 'Intensity' })
    .on('change', () => callbacks.onLiveUpdate())
  lightFolder.addBinding(config, 'lightHeight', { min: 200, max: 3000, step: 50, label: 'Height' })
    .on('change', () => callbacks.onLiveUpdate())
  lightFolder.addBinding(config, 'lightAngle', { min: 0.1, max: 1.5, step: 0.05, label: 'Angle' })
    .on('change', () => callbacks.onLiveUpdate())
  lightFolder.addBinding(config, 'lightPenumbra', { min: 0, max: 1, step: 0.05, label: 'Penumbra' })
    .on('change', () => callbacks.onLiveUpdate())
  lightFolder.addBinding(config, 'lightDecay', { min: 0, max: 2, step: 0.05, label: 'Decay' })
    .on('change', () => callbacks.onLiveUpdate())

  // --- Camera ---
  const cameraFolder = pane.addFolder({ title: 'Camera' })
  cameraFolder.addBinding(config, 'fov', { min: 20, max: 120, step: 1, label: 'FOV' })
    .on('change', () => callbacks.onLiveUpdate())

  // --- 2D Overlay ---
  const overlayFolder = pane.addFolder({ title: '2D Overlay' })
  overlayFolder.addBinding(config, 'showCircles', { label: 'Circles' })
  overlayFolder.addBinding(config, 'showTails', { label: 'Tails' })
  overlayFolder.addBinding(config, 'tailLength', { min: 5, max: 200, step: 5, label: 'Tail Length' })
  overlayFolder.addBinding(config, 'showCollisions', { label: 'Collisions' })
  overlayFolder.addBinding(config, 'showCollisionPreview', { label: 'Collision Preview' })
  overlayFolder.addBinding(config, 'collisionPreviewCount', { min: 1, max: 50, step: 1, label: 'Preview Count' })

  // --- Debug Visualization ---
  const debugFolder = pane.addFolder({ title: 'Debug Visualization', expanded: false })
  debugFolder.addBinding(config, 'showFutureTrails', { label: 'Future Trails' })
  debugFolder.addBinding(config, 'futureTrailEventsPerBall', { min: 1, max: 20, step: 1, label: 'Events/Ball' })
  debugFolder.addBinding(config, 'futureTrailInterpolationSteps', { min: 5, max: 30, step: 1, label: 'Trail Detail' })
  debugFolder.addBinding(config, 'showPhantomBalls', { label: 'Phantom Balls' })
  debugFolder.addBinding(config, 'phantomBallOpacity', { min: 0.1, max: 1.0, step: 0.05, label: 'Phantom Opacity' })
  debugFolder.addBinding(config, 'showBallInspector', { label: 'Ball Inspector' })

  // --- Playback ---
  const playbackFolder = pane.addFolder({ title: 'Playback', expanded: false })
  const pauseBtn = playbackFolder.addButton({ title: 'Pause' })
  pauseBtn.on('click', () => {
    callbacks.onPauseToggle()
    pauseBtn.title = pauseBtn.title === 'Pause' ? 'Resume' : 'Pause'
  })
  playbackFolder.addButton({ title: 'Step \u2192' }).on('click', () => {
    callbacks.onStepForward()
  })

  // --- Table ---
  pane.addBinding(config, 'tableColor', { label: 'Table Color' })

  // --- Performance ---
  const perfFolder = pane.addFolder({ title: 'Performance' })
  perfFolder.addBinding(config, 'showStats', { label: 'Show FPS' })

  return pane
}
