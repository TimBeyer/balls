import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts'
import { TransportBar } from './TransportBar'
import { Sidebar } from './Sidebar'
import { ScenarioPanel } from './ScenarioPanel'
import { DebugVisualizationPanel } from './DebugVisualizationPanel'
import { OverlayTogglesPanel } from './OverlayTogglesPanel'
import { SimulationStatsPanel } from './SimulationStatsPanel'
import { BallInspectorPanel } from './BallInspectorPanel'
import { EventDetailPanel } from './EventDetailPanel'
import { EventLog } from './EventLog'

export function DebugOverlay({ bridge }: { bridge: SimulationBridge }) {
  useKeyboardShortcuts(bridge)

  return (
    <>
      <TransportBar bridge={bridge} />
      <Sidebar>
        <ScenarioPanel bridge={bridge} />
        <DebugVisualizationPanel bridge={bridge} />
        <OverlayTogglesPanel bridge={bridge} />
        <SimulationStatsPanel bridge={bridge} />
      </Sidebar>
      <BallInspectorPanel bridge={bridge} />
      <EventDetailPanel bridge={bridge} />
      <EventLog bridge={bridge} />
    </>
  )
}
