import type { SimulationBridge, BallEventSnapshot, EventBallDelta } from '../../lib/debug/simulation-bridge'
import { useSimulation } from '../hooks/use-simulation'

const EVENT_COLORS: Record<string, string> = {
  CIRCLE_COLLISION: 'text-red-400',
  CUSHION_COLLISION: 'text-blue-400',
  STATE_TRANSITION: 'text-teal-400',
  STATE_UPDATE: 'text-yellow-400',
}

const EVENT_LABELS: Record<string, string> = {
  CIRCLE_COLLISION: 'Ball Collision',
  CUSHION_COLLISION: 'Cushion Collision',
  STATE_TRANSITION: 'State Transition',
  STATE_UPDATE: 'State Update',
}

const STATE_COLORS: Record<string, string> = {
  STATIONARY: 'bg-gray-500',
  ROLLING: 'bg-green-500',
  SLIDING: 'bg-yellow-500',
  SPINNING: 'bg-purple-500',
  AIRBORNE: 'bg-blue-500',
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals)
}

function vec2(v: [number, number], decimals = 1): string {
  return `(${fmt(v[0], decimals)}, ${fmt(v[1], decimals)})`
}

function magnitude(v: [number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1])
}

function StateBadge({ state }: { state: string }) {
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white ${STATE_COLORS[state] ?? 'bg-gray-600'}`}>
      {state}
    </span>
  )
}

function DeltaRow({ label, before, after }: { label: string; before: string; after: string }) {
  const changed = before !== after
  return (
    <div className="grid grid-cols-[60px_1fr_12px_1fr] items-center gap-1 text-[10px]">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-400">{before}</span>
      <span className="text-center text-gray-600">{'\u2192'}</span>
      <span className={`font-mono ${changed ? 'text-white font-semibold' : 'text-gray-400'}`}>{after}</span>
    </div>
  )
}

function AccelRow({ before, after }: { before: BallEventSnapshot; after: BallEventSnapshot }) {
  const magBefore = magnitude(before.acceleration)
  const magAfter = magnitude(after.acceleration)
  const ratio = magBefore > 0.01 ? magAfter / magBefore : 0
  const changed = Math.abs(magAfter - magBefore) > 0.1

  return (
    <div className="grid grid-cols-[60px_1fr_12px_1fr] items-center gap-1 text-[10px]">
      <span className="text-gray-500">Accel</span>
      <span className="font-mono text-gray-400">{vec2(before.acceleration, 2)}</span>
      <span className="text-center text-gray-600">{'\u2192'}</span>
      <span className={`font-mono ${changed ? 'text-white font-semibold' : 'text-gray-400'}`}>
        {vec2(after.acceleration, 2)}
        {changed && ratio > 2 && (
          <span className="ml-1 text-red-400">({fmt(ratio, 1)}x)</span>
        )}
      </span>
    </div>
  )
}

function BallDeltaSection({ delta }: { delta: EventBallDelta }) {
  const { before, after } = delta
  const stateChanged = before.motionState !== after.motionState

  return (
    <div className="rounded bg-gray-800/80 px-2 py-1.5">
      {/* Ball ID header */}
      <div className="mb-1 flex items-center gap-2 text-[10px]">
        <span className="font-mono text-gray-400">{delta.id.substring(0, 8)}</span>
        {stateChanged && (
          <span className="flex items-center gap-1">
            <StateBadge state={before.motionState} />
            <span className="text-gray-600">{'\u2192'}</span>
            <StateBadge state={after.motionState} />
          </span>
        )}
        {!stateChanged && <StateBadge state={after.motionState} />}
      </div>

      {/* Delta rows */}
      <div className="space-y-0.5">
        <DeltaRow label="Vel" before={vec2(before.velocity)} after={vec2(after.velocity)} />
        <DeltaRow label="Speed" before={`${fmt(before.speed)} mm/s`} after={`${fmt(after.speed)} mm/s`} />
        <DeltaRow
          label="AngVel"
          before={`(${fmt(before.angularVelocity[0])}, ${fmt(before.angularVelocity[1])}, ${fmt(before.angularVelocity[2])})`}
          after={`(${fmt(after.angularVelocity[0])}, ${fmt(after.angularVelocity[1])}, ${fmt(after.angularVelocity[2])})`}
        />
        <AccelRow before={before} after={after} />
        <DeltaRow label="Pos" before={vec2(before.position)} after={vec2(after.position)} />
      </div>
    </div>
  )
}

export function EventDetailPanel({ bridge }: { bridge: SimulationBridge }) {
  const snap = useSimulation(bridge)

  if (!snap.paused || !snap.currentEvent || !snap.currentEvent.deltas) return null

  const event = snap.currentEvent

  return (
    <div className="pointer-events-auto fixed bottom-24 left-2 right-2 mx-auto max-w-lg overflow-y-auto rounded-xl bg-gray-900/95 p-3 shadow-lg backdrop-blur-sm sm:bottom-20 sm:left-1/2 sm:right-auto sm:w-[480px] sm:-translate-x-1/2" style={{ maxHeight: 'calc(100vh - 10rem)' }}>
      {/* Header */}
      <div className="mb-2 flex items-center gap-3">
        <span className={`text-xs font-semibold ${EVENT_COLORS[event.type] ?? 'text-gray-400'}`}>
          {EVENT_LABELS[event.type] ?? event.type}
        </span>
        <span className="font-mono text-[11px] text-gray-500">t={event.time.toFixed(5)}s</span>
        {event.cushionType && <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-[10px] text-blue-300">{event.cushionType}</span>}
      </div>

      {/* Ball deltas */}
      <div className="flex flex-col gap-2 sm:flex-row">
        {event.deltas.map((delta) => (
          <div key={delta.id} className="flex-1">
            <BallDeltaSection delta={delta} />
          </div>
        ))}
      </div>
    </div>
  )
}
