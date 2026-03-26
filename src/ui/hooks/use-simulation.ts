import { useSyncExternalStore } from 'react'
import type { SimulationBridge, SimulationSnapshot } from '../../lib/debug/simulation-bridge'

export function useSimulation(bridge: SimulationBridge): SimulationSnapshot {
  return useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
}
