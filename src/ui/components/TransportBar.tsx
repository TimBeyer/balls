import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import { useSimulation } from '../hooks/use-simulation'

const SPEED_PRESETS = [0.25, 0.5, 1, 2, 5]

export function TransportBar({ bridge }: { bridge: SimulationBridge }) {
  const snap = useSimulation(bridge)

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl bg-gray-900/90 px-4 py-2 shadow-lg backdrop-blur-sm">
      {/* Pause / Play */}
      <button
        onClick={() => bridge.callbacks.onPauseToggle()}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 text-white transition hover:bg-gray-600"
        title={snap.paused ? 'Resume (Space)' : 'Pause (Space)'}
      >
        {snap.paused ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        )}
      </button>

      {/* Step Forward */}
      <button
        onClick={() => bridge.callbacks.onStepForward()}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 text-white transition hover:bg-gray-600 disabled:opacity-30"
        disabled={!snap.paused}
        title="Step Forward (→)"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 4l10 8-10 8V4zm10 0h3v16h-3V4z" />
        </svg>
      </button>

      {/* Divider */}
      <div className="h-6 w-px bg-gray-600" />

      {/* Speed presets */}
      <div className="flex gap-1">
        {SPEED_PRESETS.map((speed) => (
          <button
            key={speed}
            onClick={() => {
              bridge.config.simulationSpeed = speed
            }}
            className={`rounded px-2 py-0.5 text-xs font-medium transition ${
              Math.abs(snap.simulationSpeed - speed) < 0.01
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-gray-600" />

      {/* Time display */}
      <div className="font-mono text-sm text-gray-300">
        <span className="text-gray-500">t=</span>
        {snap.currentProgress.toFixed(3)}s
      </div>

      {/* Buffer indicator */}
      <div
        className={`h-2 w-2 rounded-full ${snap.simulationDone ? 'bg-gray-500' : snap.bufferDepth > 10 ? 'bg-green-500' : 'bg-yellow-500'}`}
        title={`Buffer: ${snap.bufferDepth} events${snap.simulationDone ? ' (done)' : ''}`}
      />
    </div>
  )
}
