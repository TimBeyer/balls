import { useState } from 'react'
import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import { allScenarios } from '../../lib/scenarios'
import { useSimulation } from '../hooks/use-simulation'
import { SidebarSection, Slider } from './Sidebar'

export function ScenarioPanel({ bridge }: { bridge: SimulationBridge }) {
  const [scenario, setScenario] = useState(bridge.config.scenarioName)
  const [numBalls, setNumBalls] = useState(bridge.config.numBalls)
  const snap = useSimulation(bridge)

  const isRandom = scenario === ''

  return (
    <SidebarSection title="Scenario">
      <select
        value={scenario}
        onChange={(e) => {
          setScenario(e.target.value)
          bridge.config.scenarioName = e.target.value
        }}
        className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">(Random)</option>
        {allScenarios.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>

      {isRandom && (
        <div className="mt-2">
          <Slider label="Balls" value={numBalls} min={1} max={500} step={1} onChange={(v) => { setNumBalls(v); bridge.config.numBalls = v }} />
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <select
          value={bridge.config.physicsProfile}
          onChange={(e) => {
            bridge.config.physicsProfile = e.target.value as 'pool' | 'simple2d'
          }}
          className="flex-1 rounded bg-gray-700 px-2 py-1 text-xs text-gray-200 outline-none"
        >
          <option value="pool">Pool (3D)</option>
          <option value="simple2d">Simple 2D</option>
        </select>

        <button
          onClick={() => bridge.callbacks.onRestartRequired()}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-500"
        >
          Restart
        </button>
      </div>

      {/* Ball count display */}
      <div className="mt-1 text-right font-mono text-[10px] text-gray-500">{snap.ballCount} balls active</div>
    </SidebarSection>
  )
}
