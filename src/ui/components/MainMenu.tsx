import { useState } from 'react'

export type GameMode = 'eight-ball' | 'nine-ball' | 'snooker'

interface MainMenuProps {
  onStartGame: (mode: GameMode) => void
  onSandbox: () => void
}

export function MainMenu({ onStartGame, onSandbox }: MainMenuProps) {
  const [hoveredMode, setHoveredMode] = useState<string | null>(null)

  const gameModes: { id: GameMode; label: string; description: string; color: string }[] = [
    { id: 'eight-ball', label: '8-Ball', description: 'Classic pool — solids vs stripes', color: '#2563eb' },
    { id: 'nine-ball', label: '9-Ball', description: 'Pot balls in order, sink the 9', color: '#f59e0b' },
    { id: 'snooker', label: 'Snooker', description: 'Reds and colors on a full-size table', color: '#dc2626' },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        zIndex: 100,
        pointerEvents: 'auto',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <h1
        style={{
          color: '#f8fafc',
          fontSize: 'clamp(2rem, 6vw, 3.5rem)',
          fontWeight: 700,
          marginBottom: '0.5rem',
          letterSpacing: '-0.02em',
        }}
      >
        Billiards
      </h1>
      <p style={{ color: '#94a3b8', fontSize: 'clamp(0.875rem, 2vw, 1.125rem)', marginBottom: '2.5rem' }}>
        Choose a game mode
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          width: 'min(90vw, 400px)',
        }}
      >
        {gameModes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onStartGame(mode.id)}
            onPointerEnter={() => setHoveredMode(mode.id)}
            onPointerLeave={() => setHoveredMode(null)}
            style={{
              padding: '1.25rem 1.5rem',
              borderRadius: '12px',
              border: `2px solid ${hoveredMode === mode.id ? mode.color : '#334155'}`,
              background: hoveredMode === mode.id ? `${mode.color}22` : '#1e293b',
              color: '#f8fafc',
              fontSize: 'clamp(1rem, 3vw, 1.25rem)',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 150ms',
              minHeight: '70px',
              touchAction: 'manipulation',
            }}
          >
            <div>{mode.label}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 400, marginTop: '0.25rem' }}>
              {mode.description}
            </div>
          </button>
        ))}

        <button
          onClick={onSandbox}
          onPointerEnter={() => setHoveredMode('sandbox')}
          onPointerLeave={() => setHoveredMode(null)}
          style={{
            padding: '1rem 1.5rem',
            borderRadius: '12px',
            border: `2px solid ${hoveredMode === 'sandbox' ? '#64748b' : '#334155'}`,
            background: hoveredMode === 'sandbox' ? '#33415522' : 'transparent',
            color: '#94a3b8',
            fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 150ms',
            marginTop: '0.5rem',
            minHeight: '50px',
            touchAction: 'manipulation',
          }}
        >
          Sandbox Mode
        </button>
      </div>
    </div>
  )
}
