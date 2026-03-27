import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import { useSimulation } from '../hooks/use-simulation'

const SPEED_PRESETS = [0.25, 0.5, 1, 2, 5]

export function TransportBar({ bridge }: { bridge: SimulationBridge }) {
  const snap = useSimulation(bridge)

  return (
    <div className="pointer-events-auto fixed bottom-2 left-2 right-2 mx-auto flex max-w-xl flex-col items-stretch gap-1.5 rounded-xl bg-gray-900/90 px-3 py-2 shadow-lg backdrop-blur-sm sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:px-4">
      {/* Timeline slider */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[10px] text-gray-500">
          {snap.currentProgress.toFixed(1)}s
        </span>
        <input
          type="range"
          min={0}
          max={snap.maxTime || 1}
          step={0.0001}
          value={snap.currentProgress}
          onChange={(e) => bridge.callbacks.onSeek(Number(e.target.value))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-gray-700 accent-blue-500"
        />
        <span className="shrink-0 font-mono text-[10px] text-gray-500">
          {snap.maxTime.toFixed(1)}s
        </span>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Step Back */}
        <button
          onClick={() => bridge.callbacks.onStepBack()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-700 text-white transition hover:bg-gray-600 disabled:opacity-30"
          disabled={!snap.paused || !snap.canStepBack}
          title="Step Back (←)"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 20L8 12l10-8v16zM8 20H5V4h3v16z" />
          </svg>
        </button>

        {/* Pause / Play */}
        <button
          onClick={() => bridge.callbacks.onPauseToggle()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-700 text-white transition hover:bg-gray-600"
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-700 text-white transition hover:bg-gray-600 disabled:opacity-30"
          disabled={!snap.paused}
          title="Step Forward (→)"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 4l10 8-10 8V4zm10 0h3v16h-3V4z" />
          </svg>
        </button>

        {/* Divider */}
        <div className="hidden h-6 w-px bg-gray-600 sm:block" />

        {/* Speed presets */}
        <div className="flex gap-1">
          {SPEED_PRESETS.map((speed) => (
            <button
              key={speed}
              onClick={() => {
                bridge.config.simulationSpeed = speed
              }}
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition sm:px-2 sm:text-xs ${
                Math.abs(snap.simulationSpeed - speed) < 0.01
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        {/* Time + buffer */}
        <div className="flex items-center gap-1.5">
          <div className="font-mono text-xs text-gray-300 sm:text-sm">
            <span className="text-gray-500">t=</span>
            {snap.currentProgress.toFixed(3)}s
          </div>
          <div
            className={`h-2 w-2 shrink-0 rounded-full ${snap.simulationDone ? 'bg-gray-500' : snap.bufferDepth > 10 ? 'bg-green-500' : 'bg-yellow-500'}`}
            title={`Buffer: ${snap.bufferDepth} events${snap.simulationDone ? ' (done)' : ''}`}
          />
        </div>
      </div>
    </div>
  )
}
