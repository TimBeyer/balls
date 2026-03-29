import { useState, type ReactNode } from 'react'

export function Sidebar({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      {/* Toggle tab */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`pointer-events-auto fixed top-1/2 z-10 -translate-y-1/2 rounded-l-md bg-gray-900/90 px-1 py-3 text-gray-400 transition-all hover:text-white ${collapsed ? 'right-0' : 'right-[280px]'}`}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        <svg className={`h-4 w-4 transition ${collapsed ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* Sidebar panel */}
      <div
        className={`pointer-events-auto fixed right-0 top-0 h-full w-[280px] overflow-y-auto bg-gray-900/90 backdrop-blur-sm transition-transform ${collapsed ? 'translate-x-full' : 'translate-x-0'}`}
      >
        <div className="flex flex-col gap-1 p-3 pb-20">{children}</div>
      </div>
    </>
  )
}

export function SidebarSection({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg bg-gray-800/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold tracking-wide text-gray-400 uppercase transition hover:text-gray-200"
      >
        {title}
        <svg className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1">
      <span className="text-xs text-gray-300">{label}</span>
      <div
        className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-gray-600'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
    </label>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 py-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-300">{label}</span>
        <span className="font-mono text-xs text-gray-500">{Number.isInteger(step) && step >= 1 ? value : value.toFixed(String(step).split('.')[1]?.length ?? 2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-600 accent-blue-500"
      />
    </label>
  )
}
