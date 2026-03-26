import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import { useSimulation } from '../hooks/use-simulation'
import { SidebarSection } from './Sidebar'

const MOTION_COLORS: Record<string, string> = {
  STATIONARY: 'bg-gray-500',
  ROLLING: 'bg-green-500',
  SLIDING: 'bg-yellow-500',
  SPINNING: 'bg-purple-500',
  AIRBORNE: 'bg-blue-500',
}

export function SimulationStatsPanel({ bridge }: { bridge: SimulationBridge }) {
  const snap = useSimulation(bridge)
  const dist = snap.motionDistribution
  const total = snap.ballCount || 1

  return (
    <SidebarSection title="Stats" defaultOpen={false}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-gray-400">Balls</span>
        <span className="text-right font-mono text-gray-200">{snap.ballCount}</span>
        <span className="text-gray-400">Buffer</span>
        <span className="text-right font-mono text-gray-200">{snap.bufferDepth}</span>
        <span className="text-gray-400">Status</span>
        <span className="text-right font-mono text-gray-200">{snap.simulationDone ? 'Done' : 'Running'}</span>
      </div>

      {/* Motion state distribution bar */}
      {Object.keys(dist).length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] text-gray-500 uppercase">Motion States</div>
          <div className="flex h-3 overflow-hidden rounded-sm">
            {Object.entries(dist).map(([state, count]) =>
              count > 0 ? (
                <div
                  key={state}
                  className={`${MOTION_COLORS[state] ?? 'bg-gray-600'}`}
                  style={{ width: `${(count / total) * 100}%` }}
                  title={`${state}: ${count}`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {Object.entries(dist).map(([state, count]) =>
              count > 0 ? (
                <div key={state} className="flex items-center gap-1">
                  <div className={`h-2 w-2 rounded-full ${MOTION_COLORS[state] ?? 'bg-gray-600'}`} />
                  <span className="text-[10px] text-gray-400">
                    {state.charAt(0) + state.slice(1).toLowerCase()} {count}
                  </span>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </SidebarSection>
  )
}
