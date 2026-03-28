import { useState } from 'react'
import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import type { PhysicsOverrides } from '../../lib/config'
import { SidebarSection, Slider } from './Sidebar'

interface Preset {
  name: string
  label: string
  overrides: PhysicsOverrides
}

const presets: Preset[] = [
  { name: 'pool', label: 'Pool (default)', overrides: {} },
  {
    name: 'ice',
    label: 'Ice Table',
    overrides: { muSliding: 0.02, muRolling: 0.001, muSpinning: 0.005 },
  },
  {
    name: 'velvet',
    label: 'Velvet Cloth',
    overrides: { muSliding: 0.5, muRolling: 0.05, muSpinning: 0.1 },
  },
  {
    name: 'superball',
    label: 'Super Elastic',
    overrides: { eBallBall: 1.0, eRestitution: 1.0 },
  },
  {
    name: 'clay',
    label: 'Clay Balls',
    overrides: { eBallBall: 0.3, eRestitution: 0.3, muRolling: 0.05 },
  },
  {
    name: 'moon',
    label: 'Moon Gravity',
    overrides: { gravity: 1635 },
  },
  {
    name: 'jupiter',
    label: 'Jupiter Gravity',
    overrides: { gravity: 24790 },
  },
  {
    name: 'frictionless',
    label: 'Zero Friction',
    overrides: { muSliding: 0, muRolling: 0, muSpinning: 0 },
  },
]

// Default pool values for reference
const DEFAULTS = {
  gravity: 9810,
  muSliding: 0.2,
  muRolling: 0.01,
  muSpinning: 0.044,
  eBallBall: 0.93,
  eRestitution: 0.85,
}

export function PhysicsPanel({ bridge }: { bridge: SimulationBridge }) {
  const [overrides, setOverrides] = useState<PhysicsOverrides>(bridge.config.physicsOverrides)
  const [activePreset, setActivePreset] = useState('pool')

  function apply(next: PhysicsOverrides) {
    setOverrides(next)
    bridge.config.physicsOverrides = next
  }

  function applyPreset(preset: Preset) {
    setActivePreset(preset.name)
    apply(preset.overrides)
  }

  function setField(field: keyof PhysicsOverrides, value: number) {
    setActivePreset('')
    const next = { ...overrides, [field]: value }
    apply(next)
  }

  function effective(field: keyof PhysicsOverrides): number {
    return overrides[field] ?? DEFAULTS[field]
  }

  return (
    <SidebarSection title="Physics" defaultOpen={false}>
      {/* Preset buttons */}
      <div className="mb-2 flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.name}
            onClick={() => applyPreset(p)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
              activePreset === p.name
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Sliders */}
      <Slider label="Gravity (mm/s\u00B2)" value={effective('gravity')} min={0} max={30000} step={100} onChange={(v) => setField('gravity', v)} />
      <Slider label="Sliding friction" value={effective('muSliding')} min={0} max={1} step={0.01} onChange={(v) => setField('muSliding', v)} />
      <Slider label="Rolling friction" value={effective('muRolling')} min={0} max={0.2} step={0.001} onChange={(v) => setField('muRolling', v)} />
      <Slider label="Spinning friction" value={effective('muSpinning')} min={0} max={0.2} step={0.001} onChange={(v) => setField('muSpinning', v)} />
      <Slider label="Ball-ball restitution" value={effective('eBallBall')} min={0} max={1} step={0.01} onChange={(v) => setField('eBallBall', v)} />
      <Slider label="Cushion restitution" value={effective('eRestitution')} min={0} max={1} step={0.01} onChange={(v) => setField('eRestitution', v)} />

      <div className="mt-2 text-[10px] text-gray-500">Changes apply on Restart</div>
    </SidebarSection>
  )
}
