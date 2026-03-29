import { useEffect } from 'react'
import type { SimulationBridge } from '../../lib/debug/simulation-bridge'

export function useKeyboardShortcuts(bridge: SimulationBridge) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire when typing in input fields
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          bridge.callbacks.onPauseToggle()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) {
            bridge.callbacks.onStepToNextBallEvent()
          } else {
            bridge.callbacks.onStepForward()
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          bridge.callbacks.onStepBack()
          break
        case 'Equal':
        case 'NumpadAdd':
          e.preventDefault()
          bridge.config.simulationSpeed = Math.min(5, bridge.config.simulationSpeed + 0.5)
          break
        case 'Minus':
        case 'NumpadSubtract':
          e.preventDefault()
          bridge.config.simulationSpeed = Math.max(0.1, bridge.config.simulationSpeed - 0.5)
          break
        case 'Digit1':
          bridge.config.simulationSpeed = 1
          break
        case 'Digit2':
          bridge.config.simulationSpeed = 2
          break
        case 'Digit3':
          bridge.config.simulationSpeed = 3
          break
        case 'Digit4':
          bridge.config.simulationSpeed = 4
          break
        case 'Digit5':
          bridge.config.simulationSpeed = 5
          break
        case 'KeyI':
          bridge.config.showBallInspector = !bridge.config.showBallInspector
          break
        case 'KeyF':
          bridge.config.showFutureTrails = !bridge.config.showFutureTrails
          break
        case 'KeyT':
          bridge.config.showTails = !bridge.config.showTails
          break
        case 'KeyC':
          bridge.config.showCollisions = !bridge.config.showCollisions
          break
        case 'Escape':
          bridge.callbacks.clearBallSelection()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bridge])
}
