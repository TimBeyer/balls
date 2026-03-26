import { useState } from 'react'
import type { SimulationBridge } from '../../lib/debug/simulation-bridge'
import { SidebarSection, Toggle, Slider } from './Sidebar'

export function DebugVisualizationPanel({ bridge }: { bridge: SimulationBridge }) {
  const c = bridge.config
  const [, rerender] = useState(0)
  const tick = () => rerender((n) => n + 1)

  return (
    <SidebarSection title="Debug Visualization" defaultOpen={false}>
      <Toggle
        label="Future Trails (F)"
        checked={c.showFutureTrails}
        onChange={(v) => { c.showFutureTrails = v; tick() }}
      />
      {c.showFutureTrails && (
        <>
          <Slider label="Events/Ball" value={c.futureTrailEventsPerBall} min={1} max={20} step={1} onChange={(v) => { c.futureTrailEventsPerBall = v; tick() }} />
          <Slider label="Trail Detail" value={c.futureTrailInterpolationSteps} min={5} max={30} step={1} onChange={(v) => { c.futureTrailInterpolationSteps = v; tick() }} />
        </>
      )}

      <Toggle
        label="Phantom Balls"
        checked={c.showPhantomBalls}
        onChange={(v) => { c.showPhantomBalls = v; tick() }}
      />
      {c.showPhantomBalls && (
        <Slider label="Phantom Opacity" value={c.phantomBallOpacity} min={0.1} max={1.0} step={0.05} onChange={(v) => { c.phantomBallOpacity = v; tick() }} />
      )}

      <Toggle
        label="Ball Inspector (I)"
        checked={c.showBallInspector}
        onChange={(v) => { c.showBallInspector = v; tick() }}
      />
    </SidebarSection>
  )
}
