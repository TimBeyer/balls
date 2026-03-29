import { useState } from 'react'
import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import { SidebarSection, Toggle, Slider } from './Sidebar'

export function OverlayTogglesPanel({ bridge }: { bridge: SimulationBridge }) {
  const c = bridge.config
  const [, rerender] = useState(0)
  const tick = () => rerender((n) => n + 1)

  return (
    <SidebarSection title="2D Overlays" defaultOpen={false}>
      <Toggle label="Circles" checked={c.showCircles} onChange={(v) => { c.showCircles = v; tick() }} />
      <Toggle label="Tails (T)" checked={c.showTails} onChange={(v) => { c.showTails = v; tick() }} />
      {c.showTails && (
        <Slider label="Tail Length" value={c.tailLength} min={5} max={200} step={5} onChange={(v) => { c.tailLength = v; tick() }} />
      )}
      <Toggle label="Collisions (C)" checked={c.showCollisions} onChange={(v) => { c.showCollisions = v; tick() }} />
      <Toggle label="Collision Preview" checked={c.showCollisionPreview} onChange={(v) => { c.showCollisionPreview = v; tick() }} />
      {c.showCollisionPreview && (
        <Slider label="Preview Count" value={c.collisionPreviewCount} min={1} max={50} step={1} onChange={(v) => { c.collisionPreviewCount = v; tick() }} />
      )}
    </SidebarSection>
  )
}
