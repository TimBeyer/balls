import { createRoot } from 'react-dom/client'
import { DebugOverlay } from './components/DebugOverlay'
import type { SimulationBridge } from '../lib/debug/simulation-bridge'
import './index.css'

export function mountDebugOverlay(bridge: SimulationBridge) {
  const container = document.createElement('div')
  container.id = 'debug-overlay'
  container.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;'
  document.body.appendChild(container)

  const root = createRoot(container)
  root.render(<DebugOverlay bridge={bridge} />)
  return root
}
