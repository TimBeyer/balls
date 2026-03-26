import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import { useSimulation } from '../hooks/use-simulation'

const STATE_COLORS: Record<string, string> = {
  STATIONARY: 'bg-gray-500',
  ROLLING: 'bg-green-500',
  SLIDING: 'bg-yellow-500',
  SPINNING: 'bg-purple-500',
  AIRBORNE: 'bg-blue-500',
}

export function BallInspectorPanel({ bridge }: { bridge: SimulationBridge }) {
  const snap = useSimulation(bridge)

  if (!snap.selectedBallId || !snap.selectedBallData) return null

  const d = snap.selectedBallData

  return (
    <div className="pointer-events-auto fixed left-3 top-1/2 w-56 -translate-y-1/2 rounded-xl bg-gray-900/90 p-3 shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300">Ball Inspector</span>
        <button
          onClick={() => bridge.callbacks.clearBallSelection()}
          className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 transition hover:bg-gray-700 hover:text-gray-200"
        >
          ESC
        </button>
      </div>

      {/* ID */}
      <div className="mb-2 rounded bg-gray-800 px-2 py-1 font-mono text-[11px] text-gray-400">{d.id.substring(0, 12)}</div>

      {/* Properties */}
      <div className="space-y-1.5 text-[11px]">
        <Row label="Position" value={`(${d.position[0].toFixed(1)}, ${d.position[1].toFixed(1)})`} />
        <Row label="Velocity" value={`(${d.velocity[0].toFixed(1)}, ${d.velocity[1].toFixed(1)})`} />
        <Row label="Speed" value={`${d.speed.toFixed(1)} mm/s`} />
        <Row label="AngVel" value={`(${d.angularVelocity[0].toFixed(1)}, ${d.angularVelocity[1].toFixed(1)}, ${d.angularVelocity[2].toFixed(1)})`} />

        {/* Motion state badge */}
        <div className="flex items-center justify-between">
          <span className="text-gray-500">State</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${STATE_COLORS[d.motionState] ?? 'bg-gray-600'}`}>
            {d.motionState}
          </span>
        </div>

        <Row label="Accel" value={`(${d.acceleration[0].toFixed(2)}, ${d.acceleration[1].toFixed(2)})`} />
        <Row label="Radius" value={d.radius.toFixed(1)} />
        <Row label="Mass" value={d.mass.toFixed(0)} />
        <Row label="Ref Time" value={`${d.time.toFixed(4)}s`} />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-300">{value}</span>
    </div>
  )
}
