import { useState } from 'react'
import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import { BALL_TEXTURE_SETS, type BallTextureSet } from '../../lib/scene/ball-textures'
import { SidebarSection, Toggle } from './Sidebar'

export function AppearancePanel({ bridge }: { bridge: SimulationBridge }) {
  const [textureSet, setTextureSet] = useState<BallTextureSet>(bridge.config.ballTextureSet)
  const [rotation, setRotation] = useState(bridge.config.ballRotationEnabled)

  return (
    <SidebarSection title="Ball Appearance">
      <label className="flex flex-col gap-1 py-1">
        <span className="text-xs text-gray-300">Texture Set</span>
        <select
          value={textureSet}
          onChange={(e) => {
            const value = e.target.value as BallTextureSet
            setTextureSet(value)
            bridge.config.ballTextureSet = value
            bridge.callbacks.onLiveUpdate()
          }}
          className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
        >
          {BALL_TEXTURE_SETS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <Toggle
        label="Ball Rotation"
        checked={rotation}
        onChange={(v) => {
          setRotation(v)
          bridge.config.ballRotationEnabled = v
          bridge.callbacks.onLiveUpdate()
        }}
      />
    </SidebarSection>
  )
}
