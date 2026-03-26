import { useState } from 'react'
import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import { useSimulation } from '../hooks/use-simulation'

const EVENT_COLORS: Record<string, string> = {
  CIRCLE_COLLISION: 'text-red-400',
  CUSHION_COLLISION: 'text-blue-400',
  STATE_TRANSITION: 'text-teal-400',
  STATE_UPDATE: 'text-yellow-400',
}

const EVENT_LABELS: Record<string, string> = {
  CIRCLE_COLLISION: 'Ball',
  CUSHION_COLLISION: 'Cushion',
  STATE_TRANSITION: 'State',
  STATE_UPDATE: 'Update',
}

export function EventLog({ bridge }: { bridge: SimulationBridge }) {
  const snap = useSimulation(bridge)
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className="pointer-events-auto fixed bottom-16 right-3 w-72">
      {/* Header / toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between rounded-t-lg bg-gray-900/90 px-3 py-1.5 text-xs font-semibold text-gray-400 backdrop-blur-sm transition hover:text-gray-200"
      >
        <span>Event Log ({snap.recentEvents.length})</span>
        <svg className={`h-3 w-3 transition ${collapsed ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Event list */}
      {!collapsed && (
        <div className="max-h-60 overflow-y-auto rounded-b-lg bg-gray-900/90 backdrop-blur-sm">
          {snap.recentEvents.length === 0 ? (
            <div className="px-3 py-2 text-center text-[10px] text-gray-600">No events yet</div>
          ) : (
            snap.recentEvents.map((event, i) => (
              <div
                key={`${event.time}-${i}`}
                className="flex items-baseline gap-2 border-t border-gray-800/50 px-3 py-1 text-[10px]"
              >
                <span className="shrink-0 font-mono text-gray-500">{event.time.toFixed(4)}s</span>
                <span className={`shrink-0 font-medium ${EVENT_COLORS[event.type] ?? 'text-gray-400'}`}>
                  {EVENT_LABELS[event.type] ?? event.type}
                </span>
                <span className="truncate text-gray-500">
                  {event.involvedBalls.map((id) => id.substring(0, 6)).join(' \u2194 ')}
                  {event.cushionType ? ` (${event.cushionType})` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
