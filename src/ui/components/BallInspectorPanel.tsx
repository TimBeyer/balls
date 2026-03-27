import type { SimulationBridge, EventEntry } from '../../lib/debug/simulation-bridge'
import { useSimulation } from '../hooks/use-simulation'

const STATE_COLORS: Record<string, string> = {
  STATIONARY: 'bg-gray-500',
  ROLLING: 'bg-green-500',
  SLIDING: 'bg-yellow-500',
  SPINNING: 'bg-purple-500',
  AIRBORNE: 'bg-blue-500',
}

const EVENT_COLORS: Record<string, string> = {
  CIRCLE_COLLISION: 'text-red-400',
  CUSHION_COLLISION: 'text-blue-400',
  STATE_TRANSITION: 'text-teal-400',
  STATE_UPDATE: 'text-yellow-400',
}

const EVENT_ICONS: Record<string, string> = {
  CIRCLE_COLLISION: '\u25CF\u25CF',
  CUSHION_COLLISION: '\u2502',
  STATE_TRANSITION: '\u21BB',
  STATE_UPDATE: '\u25C6',
}

export function BallInspectorPanel({ bridge }: { bridge: SimulationBridge }) {
  const snap = useSimulation(bridge)

  if (!snap.selectedBallId || !snap.selectedBallData) return null

  const d = snap.selectedBallData
  const ballId = snap.selectedBallId

  // Filter events that involve this ball
  const ballEvents = snap.recentEvents.filter((e) => e.involvedBalls.includes(ballId))

  return (
    <div className="pointer-events-auto fixed left-3 top-1/2 w-64 -translate-y-1/2 rounded-xl bg-gray-900/90 p-3 shadow-lg backdrop-blur-sm">
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

      {/* Event History */}
      {ballEvents.length > 0 && (
        <div className="mt-3 border-t border-gray-700 pt-2">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">Event History</div>
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {ballEvents.map((event, i) => (
              <BallEventRow key={`${event.time}-${i}`} event={event} ballId={ballId} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BallEventRow({ event, ballId }: { event: EventEntry; ballId: string }) {
  const delta = event.deltas?.find((d) => d.id === ballId)
  const stateChanged = delta && delta.before.motionState !== delta.after.motionState

  return (
    <div className="rounded bg-gray-800/60 px-2 py-1">
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className={EVENT_COLORS[event.type] ?? 'text-gray-400'}>{EVENT_ICONS[event.type] ?? '\u2022'}</span>
        <span className="font-mono text-gray-500">{event.time.toFixed(4)}s</span>
        {event.cushionType && <span className="text-blue-400">({event.cushionType})</span>}
        {event.type === 'CIRCLE_COLLISION' && (
          <span className="text-gray-600">
            {event.involvedBalls
              .filter((id) => id !== ballId)
              .map((id) => id.substring(0, 6))
              .join(', ')}
          </span>
        )}
      </div>
      {delta && (
        <div className="mt-0.5 text-[9px]">
          {stateChanged && (
            <div className="flex items-center gap-1">
              <span className={`inline-block rounded-full px-1 py-0 text-white ${STATE_COLORS[delta.before.motionState] ?? 'bg-gray-600'}`}>
                {delta.before.motionState}
              </span>
              <span className="text-gray-600">{'\u2192'}</span>
              <span className={`inline-block rounded-full px-1 py-0 text-white ${STATE_COLORS[delta.after.motionState] ?? 'bg-gray-600'}`}>
                {delta.after.motionState}
              </span>
            </div>
          )}
          <div className="text-gray-600">
            v: {delta.before.speed.toFixed(1)}{'\u2192'}{delta.after.speed.toFixed(1)} mm/s
            {' | '}a: {Math.sqrt(delta.before.acceleration[0] ** 2 + delta.before.acceleration[1] ** 2).toFixed(0)}
            {'\u2192'}{Math.sqrt(delta.after.acceleration[0] ** 2 + delta.after.acceleration[1] ** 2).toFixed(0)}
          </div>
        </div>
      )}
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
