import { Pane } from 'tweakpane'
import { SimulationConfig } from './config'

export interface UICallbacks {
  onRestartRequired: () => void
  onLiveUpdate: () => void
}

export function createAdvancedUI(config: SimulationConfig, callbacks: UICallbacks): Pane {
  const pane = new Pane({ title: 'Advanced', expanded: false })

  // --- 3D Rendering ---
  const renderFolder = pane.addFolder({ title: '3D Rendering', expanded: false })
  renderFolder
    .addBinding(config, 'shadowsEnabled', { label: 'Shadows' })
    .on('change', () => callbacks.onLiveUpdate())
  renderFolder
    .addBinding(config, 'shadowMapSize', {
      label: 'Shadow Quality',
      options: { Low: 256, Medium: 512, High: 1024, Ultra: 2048 },
    })
    .on('change', () => callbacks.onLiveUpdate())
  renderFolder
    .addBinding(config, 'ballRoughness', { min: 0, max: 1, step: 0.05, label: 'Ball Roughness' })
    .on('change', () => callbacks.onLiveUpdate())
  renderFolder
    .addBinding(config, 'ballSegments', {
      label: 'Ball Detail',
      options: { Low: 8, Medium: 16, High: 32, Ultra: 64 },
    })
    .on('change', () => callbacks.onRestartRequired())

  // --- Lighting ---
  const lightFolder = pane.addFolder({ title: 'Lighting', expanded: false })
  lightFolder
    .addBinding(config, 'lightIntensity', { min: 0, max: 5, step: 0.1, label: 'Intensity' })
    .on('change', () => callbacks.onLiveUpdate())
  lightFolder
    .addBinding(config, 'lightHeight', { min: 200, max: 3000, step: 50, label: 'Height' })
    .on('change', () => callbacks.onLiveUpdate())
  lightFolder
    .addBinding(config, 'lightAngle', { min: 0.1, max: 1.5, step: 0.05, label: 'Angle' })
    .on('change', () => callbacks.onLiveUpdate())
  lightFolder
    .addBinding(config, 'lightPenumbra', { min: 0, max: 1, step: 0.05, label: 'Penumbra' })
    .on('change', () => callbacks.onLiveUpdate())
  lightFolder
    .addBinding(config, 'lightDecay', { min: 0, max: 2, step: 0.05, label: 'Decay' })
    .on('change', () => callbacks.onLiveUpdate())

  // --- Camera ---
  const cameraFolder = pane.addFolder({ title: 'Camera', expanded: false })
  cameraFolder
    .addBinding(config, 'fov', { min: 20, max: 120, step: 1, label: 'FOV' })
    .on('change', () => callbacks.onLiveUpdate())

  // --- Table ---
  pane.addBinding(config, 'tableColor', { label: 'Table Color' })

  // --- Performance ---
  pane.addBinding(config, 'showStats', { label: 'Show FPS' })

  return pane
}
