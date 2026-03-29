import { useSyncExternalStore, useCallback, useRef } from 'react'
import type { GameBridge } from '../../lib/game/game-bridge'
import type Vector2D from '../../lib/vector2d'

function useGameBridge(bridge: GameBridge) {
  return useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
}

interface GameUIProps {
  bridge: GameBridge
}

export function GameUI({ bridge }: GameUIProps) {
  const snap = useGameBridge(bridge)
  const { gameState, scores, lastShotResult, isSimulating } = snap

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      {/* Score bar at top */}
      <ScoreBar scores={scores} phase={gameState.phase} />

      {/* Foul notification */}
      {lastShotResult?.foul && gameState.phase === 'aiming' && (
        <FoulBanner reasons={lastShotResult.foulReasons} />
      )}

      {/* Controls at bottom */}
      {gameState.phase === 'aiming' && (
        <AimControls
          power={snap.aimPower}
          strikeOffset={snap.strikeOffset}
          onPowerChange={(p) => bridge.update({ aimPower: p })}
          onStrikeOffsetChange={(o) => bridge.update({ strikeOffset: o })}
        />
      )}

      {/* Ball-in-hand indicator */}
      {gameState.phase === 'placing-cue-ball' && <BallInHandBanner />}

      {/* Game over overlay */}
      {gameState.phase === 'game-over' && (
        <GameOverOverlay
          winner={gameState.players[gameState.winner ?? 0]?.name ?? 'Unknown'}
          onNewGame={() => bridge.callbacks.onNewGame()}
          onMenu={() => bridge.callbacks.onBackToMenu()}
        />
      )}

      {/* Simulating indicator */}
      {isSimulating && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '8px 20px',
            borderRadius: '20px',
            fontSize: '14px',
          }}
        >
          Simulating...
        </div>
      )}
    </div>
  )
}

function ScoreBar({ scores }: { scores: { players: { name: string; score: number; active: boolean; group?: string }[] } }) {
  if (scores.players.length === 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        gap: '2px',
        pointerEvents: 'auto',
        zIndex: 51,
      }}
    >
      {scores.players.map((p, i) => (
        <div
          key={i}
          style={{
            padding: '10px 24px',
            background: p.active ? 'rgba(37, 99, 235, 0.9)' : 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            fontSize: 'clamp(14px, 3vw, 18px)',
            fontWeight: p.active ? 700 : 400,
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            borderRadius: i === 0 ? '0 0 0 12px' : '0 0 12px 0',
            minWidth: '120px',
            textAlign: 'center',
          }}
        >
          <div>{p.name}</div>
          <div style={{ fontSize: 'clamp(18px, 4vw, 28px)', fontWeight: 700 }}>{p.score}</div>
          {p.group && <div style={{ fontSize: '11px', opacity: 0.7, textTransform: 'capitalize' }}>{p.group}</div>}
        </div>
      ))}
    </div>
  )
}

function FoulBanner({ reasons }: { reasons: string[] }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(220, 38, 38, 0.9)',
        color: '#fff',
        padding: '10px 20px',
        borderRadius: '8px',
        fontSize: '14px',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        maxWidth: '90vw',
        textAlign: 'center',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 700 }}>FOUL</div>
      {reasons.map((r, i) => (
        <div key={i} style={{ fontSize: '12px', opacity: 0.9 }}>
          {r}
        </div>
      ))}
    </div>
  )
}

function BallInHandBanner() {
  return (
    <div
      style={{
        position: 'absolute',
        top: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(37, 99, 235, 0.9)',
        color: '#fff',
        padding: '10px 20px',
        borderRadius: '8px',
        fontSize: '14px',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        textAlign: 'center',
        pointerEvents: 'auto',
      }}
    >
      Tap the table to place the cue ball
    </div>
  )
}

function AimControls({
  power,
  strikeOffset,
  onPowerChange,
  onStrikeOffsetChange,
}: {
  power: number
  strikeOffset: Vector2D
  onPowerChange: (p: number) => void
  onStrikeOffsetChange: (o: Vector2D) => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        gap: '16px',
        alignItems: 'flex-end',
        pointerEvents: 'auto',
      }}
    >
      {/* Spin control circle */}
      <SpinCircle offset={strikeOffset} onChange={onStrikeOffsetChange} />

      {/* Power slider */}
      <PowerBar power={power} onChange={onPowerChange} />
    </div>
  )
}

function SpinCircle({
  offset,
  onChange,
}: {
  offset: Vector2D
  onChange: (o: Vector2D) => void
}) {
  const circleRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handleDrag = useCallback(
    (clientX: number, clientY: number) => {
      const el = circleRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const r = rect.width / 2

      let dx = (clientX - cx) / r
      let dy = -(clientY - cy) / r // invert Y: up = positive

      // Clamp to circle
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 1) {
        dx /= dist
        dy /= dist
      }

      onChange([dx, dy])
    },
    [onChange],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      handleDrag(e.clientX, e.clientY)
    },
    [handleDrag],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      handleDrag(e.clientX, e.clientY)
    },
    [handleDrag],
  )

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const size = 70

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      <div style={{ color: '#fff', fontSize: '11px', opacity: 0.6, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        Spin
      </div>
      <div
        ref={circleRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.15)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          position: 'relative',
          touchAction: 'none',
          cursor: 'pointer',
        }}
      >
        {/* Crosshair */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '10%',
            right: '10%',
            height: '1px',
            background: 'rgba(255,255,255,0.2)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '10%',
            bottom: '10%',
            width: '1px',
            background: 'rgba(255,255,255,0.2)',
          }}
        />
        {/* Indicator dot */}
        <div
          style={{
            position: 'absolute',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#ef4444',
            border: '2px solid #fff',
            left: `${50 + offset[0] * 40}%`,
            top: `${50 - offset[1] * 40}%`,
            transform: 'translate(-50%, -50%)',
            transition: dragging.current ? 'none' : 'all 100ms',
          }}
        />
      </div>
    </div>
  )
}

function PowerBar({ power, onChange }: { power: number; onChange: (p: number) => void }) {
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handleDrag = useCallback(
    (clientY: number) => {
      const el = barRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const normalized = 1 - (clientY - rect.top) / rect.height
      onChange(Math.max(0, Math.min(1, normalized)))
    },
    [onChange],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      handleDrag(e.clientY)
    },
    [handleDrag],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      handleDrag(e.clientY)
    },
    [handleDrag],
  )

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const barHeight = 160
  const barWidth = 36

  // Color gradient from green (low power) to red (high power)
  const hue = 120 - power * 120 // 120 = green, 0 = red

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      <div style={{ color: '#fff', fontSize: '11px', opacity: 0.6, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        Power
      </div>
      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: barWidth,
          height: barHeight,
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          position: 'relative',
          touchAction: 'none',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        {/* Fill */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${power * 100}%`,
            background: `hsl(${hue}, 80%, 50%)`,
            borderRadius: '6px',
            transition: dragging.current ? 'none' : 'height 100ms',
          }}
        />
        {/* Percentage label */}
        <div
          style={{
            position: 'absolute',
            bottom: `${power * 100}%`,
            left: '50%',
            transform: 'translate(-50%, 50%)',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 700,
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}
        >
          {Math.round(power * 100)}
        </div>
      </div>
    </div>
  )
}

function GameOverOverlay({
  winner,
  onNewGame,
  onMenu,
}: {
  winner: string
  onNewGame: () => void
  onMenu: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        pointerEvents: 'auto',
        zIndex: 60,
      }}
    >
      <div
        style={{
          background: '#1e293b',
          borderRadius: '16px',
          padding: '2rem 3rem',
          textAlign: 'center',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}
      >
        <div style={{ color: '#f59e0b', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>GAME OVER</div>
        <div style={{ color: '#f8fafc', fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: 700 }}>
          {winner} wins!
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '1.5rem', justifyContent: 'center' }}>
          <button
            onClick={onNewGame}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: '48px',
              touchAction: 'manipulation',
            }}
          >
            Play Again
          </button>
          <button
            onClick={onMenu}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              border: '2px solid #475569',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '16px',
              cursor: 'pointer',
              minHeight: '48px',
              touchAction: 'manipulation',
            }}
          >
            Menu
          </button>
        </div>
      </div>
    </div>
  )
}
