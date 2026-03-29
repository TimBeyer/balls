/**
 * Game mode entry point.
 *
 * Creates a GameController with the selected rules, sets up 3D rendering,
 * cue input handler, trajectory preview, and game UI.
 */

import * as THREE from 'three'
import Ball from './lib/ball'
import type { ReplayData } from './lib/simulation'
import { EventType } from './lib/simulation'
import SimulationScene from './lib/scene/simulation-scene'
import { CueStick } from './lib/scene/cue-stick'
import { CueInput } from './lib/input/cue-input'
import { computeTrajectoryPreview, type PreviewResult } from './lib/input/trajectory-preview'
import { GameController } from './lib/game/game-controller'
import { createGameBridge, type GameBridge } from './lib/game/game-bridge'
import type { GameRules } from './lib/game/rules'
import { createConfig } from './lib/config'
import type Vector2D from './lib/vector2d'

export interface GameInstance {
  destroy: () => void
  bridge: GameBridge
}

export function startGame(rules: GameRules, containerElement: HTMLElement): GameInstance {
  const tableConfig = rules.getTableConfig()

  // Build a SimulationConfig compatible with the game
  const config = createConfig()
  config.tableWidth = tableConfig.width
  config.tableHeight = tableConfig.height
  config.ballTextureSet = rules.getBallTextureSet()
  config.physicsProfile = 'pool'
  config.showCircles = false
  config.showTails = false
  config.showCollisions = false
  config.showCollisionPreview = false
  config.showFutureTrails = false
  config.showBallInspector = false
  config.showStats = false
  config.tableColor = '#1a6e3a' // green felt

  // Three.js renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = config.shadowsEnabled
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  containerElement.appendChild(renderer.domElement)

  // 2D overlay canvas
  const canvas2D = document.createElement('canvas')
  canvas2D.width = config.tableWidth / 2
  canvas2D.height = config.tableHeight / 2
  const ctx2D = canvas2D.getContext('2d')!

  // State
  let simulationScene: SimulationScene | null = null
  let cueStick: CueStick | null = null
  let cueInput: CueInput | null = null
  let animationFrameId: number | null = null
  let ballState: { [key: string]: Ball } = {}
  let circleIds: string[] = []
  let nextEvent: ReplayData | undefined
  let simulatedResults: ReplayData[] = []
  let currentProgress = 0
  let prevTimestamp: number | null = null
  let isSimulating = false
  let previewResult: PreviewResult | null = null

  // Ball positions for trajectory preview
  const ballPositions = new Map<string, Vector2D>()

  // Game bridge
  const bridge = createGameBridge({
    onShoot: () => {
      if (cueInput) cueInput.shoot()
    },
    onPlaceCueBall: (position: Vector2D) => {
      controller.placeCueBall(position)
    },
    onNewGame: () => {
      cleanup()
      controller.startGame()
    },
    onBackToMenu: () => {
      instance.destroy()
      window.location.hash = ''
    },
    onToggleMode: () => {
      if (!cueInput) return
      const newMode = cueInput.getMode() === 'aim' ? 'camera' : 'aim'
      cueInput.setMode(newMode)
      bridge.update({ inputMode: newMode })
    },
  })

  // Game controller
  const controller = new GameController(rules, ['Player 1', 'Player 2'], {
    onStateChange: (state) => {
      bridge.update({
        gameState: state,
        scores: rules.getScoreDisplay(state),
        validTargets: rules.getValidTargets(state),
        isSimulating: state.phase === 'simulating',
      })

      if (state.phase === 'aiming') {
        if (cueInput) {
          cueInput.setEnabled(true)
          cueInput.reset()
        }
        if (cueStick) cueStick.show()
      }
    },
    onSimulationStart: (balls, _initialEvents) => {
      cleanupScene()
      isSimulating = true
      currentProgress = 0
      prevTimestamp = null
      nextEvent = undefined
      simulatedResults = []

      // Build ball state
      ballState = {}
      circleIds = []
      const replayCircles: Ball[] = []
      for (const ball of balls) {
        ballState[ball.id] = ball
        circleIds.push(ball.id)
        replayCircles.push(ball)
        ballPositions.set(ball.id, [ball.position[0], ball.position[1]])
      }

      // Create 3D scene
      simulationScene = new SimulationScene(canvas2D, replayCircles, config, renderer.domElement)
      cueStick = new CueStick()
      simulationScene.scene.add(cueStick.mesh)
      cueStick.hide()

      // Setup cue input
      const cueBallId = rules.getCueBallId()
      const cueBall = ballState[cueBallId]
      if (cueBall) {
        if (cueInput) cueInput.destroy()
        cueInput = new CueInput(
          simulationScene.camera,
          renderer.domElement,
          tableConfig.width,
          tableConfig.height,
          {
            onAimUpdate: (direction) => {
              bridge.update({ aimDirection: direction })
              const snap = bridge.getSnapshot()
              if (cueStick) {
                cueStick.update(
                  [cueBall.position[0], cueBall.position[1]],
                  direction,
                  snap.aimPower,
                  tableConfig.width,
                  tableConfig.height,
                  rules.getBallRadius(),
                )
              }
              updateTrajectoryPreview(direction, snap.aimPower)
            },
            onShoot: () => {
              if (cueStick) cueStick.hide()
              if (cueInput) cueInput.setEnabled(false)
              previewResult = null
              const snap = bridge.getSnapshot()
              controller.takeShot({
                direction: snap.aimDirection,
                power: snap.aimPower,
                strikeOffset: snap.strikeOffset,
                elevation: snap.elevation,
              })
            },
          },
        )
        cueInput.setCueBallPosition([cueBall.position[0], cueBall.position[1]])
        cueInput.setControls(simulationScene.getOrbitControls())
      }

      // Add pocket visuals
      addPocketVisuals(simulationScene.scene)

      renderer.render(simulationScene.scene, simulationScene.camera)
      startAnimationLoop()
    },
    onReplayData: (events) => {
      if (!nextEvent && events.length > 0) {
        nextEvent = events.shift()
      }
      simulatedResults = simulatedResults.concat(events)
    },
    onShotComplete: (result) => {
      isSimulating = false
      bridge.update({ lastShotResult: result, isSimulating: false })

      // Update cue ball position for input handler
      const cueBallId = rules.getCueBallId()
      const cueBallPos = ballPositions.get(cueBallId)
      if (cueBallPos && cueInput) {
        cueInput.setCueBallPosition(cueBallPos)
      }
    },
    onSimulationDone: () => {
      // Simulation complete — controller will call onShotComplete
    },
  })

  function updateTrajectoryPreview(direction: number, power: number) {
    const cueBallId = rules.getCueBallId()
    const cueBallPos = ballPositions.get(cueBallId)
    if (!cueBallPos) return

    const speed = power * rules.getMaxShotSpeed()
    const objectBalls = new Map<string, Vector2D>()
    for (const [id, pos] of ballPositions) {
      if (id !== cueBallId) objectBalls.set(id, pos)
    }

    previewResult = computeTrajectoryPreview(
      cueBallPos,
      direction,
      speed,
      objectBalls,
      rules.getBallRadius(),
      tableConfig,
      rules.getPhysicsConfig(),
    )
  }

  function addPocketVisuals(scene: THREE.Scene) {
    for (const pocket of tableConfig.pockets) {
      const geometry = new THREE.CircleGeometry(pocket.radius, 32)
      const material = new THREE.MeshBasicMaterial({ color: 0x111111 })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(
        pocket.center[0] - tableConfig.width / 2,
        -0.5,
        pocket.center[1] - tableConfig.height / 2,
      )
      scene.add(mesh)
    }
  }

  function drawTrajectoryPreview() {
    if (!previewResult || !ctx2D || isSimulating) return
    const scale = canvas2D.width / tableConfig.width

    ctx2D.save()

    // Dotted aim line
    ctx2D.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx2D.lineWidth = 1.5
    ctx2D.setLineDash([6, 6])
    ctx2D.beginPath()
    for (let i = 0; i < previewResult.cuePath.length; i++) {
      const p = previewResult.cuePath[i]
      const x = p[0] * scale
      const y = (tableConfig.height - p[1]) * scale // flip Y for canvas
      if (i === 0) ctx2D.moveTo(x, y)
      else ctx2D.lineTo(x, y)
    }
    ctx2D.stroke()
    ctx2D.setLineDash([])

    // Ghost ball at contact point
    if (previewResult.contactPoint) {
      const cp = previewResult.contactPoint
      const x = cp[0] * scale
      const y = (tableConfig.height - cp[1]) * scale
      const r = rules.getBallRadius() * scale

      ctx2D.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      ctx2D.lineWidth = 1
      ctx2D.beginPath()
      ctx2D.arc(x, y, r, 0, Math.PI * 2)
      ctx2D.stroke()
    }

    // Object ball deflection line
    if (previewResult.objectBallDeflection && previewResult.contactBallId) {
      const objPos = ballPositions.get(previewResult.contactBallId)
      if (objPos) {
        ctx2D.strokeStyle = 'rgba(255, 200, 0, 0.4)'
        ctx2D.lineWidth = 1
        ctx2D.setLineDash([4, 4])
        ctx2D.beginPath()
        ctx2D.moveTo(objPos[0] * scale, (tableConfig.height - objPos[1]) * scale)
        ctx2D.lineTo(
          previewResult.objectBallDeflection[0] * scale,
          (tableConfig.height - previewResult.objectBallDeflection[1]) * scale,
        )
        ctx2D.stroke()
        ctx2D.setLineDash([])
      }
    }

    // Cue ball deflection line
    if (previewResult.cueBallDeflection && previewResult.contactPoint) {
      ctx2D.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx2D.lineWidth = 1
      ctx2D.setLineDash([4, 4])
      ctx2D.beginPath()
      ctx2D.moveTo(
        previewResult.contactPoint[0] * scale,
        (tableConfig.height - previewResult.contactPoint[1]) * scale,
      )
      ctx2D.lineTo(
        previewResult.cueBallDeflection[0] * scale,
        (tableConfig.height - previewResult.cueBallDeflection[1]) * scale,
      )
      ctx2D.stroke()
      ctx2D.setLineDash([])
    }

    ctx2D.restore()
  }

  function applyEventSnapshots(event: ReplayData) {
    for (const snapshot of event.snapshots) {
      const ball = ballState[snapshot.id]
      if (!ball) continue

      ball.position[0] = snapshot.position[0]
      ball.position[1] = snapshot.position[1]
      ball.velocity[0] = snapshot.velocity[0]
      ball.velocity[1] = snapshot.velocity[1]
      ball.radius = snapshot.radius
      ball.time = snapshot.time
      if (snapshot.angularVelocity) ball.angularVelocity = [...snapshot.angularVelocity]
      if (snapshot.motionState !== undefined) ball.motionState = snapshot.motionState
      ball.trajectory.a[0] = snapshot.trajectoryA[0]
      ball.trajectory.a[1] = snapshot.trajectoryA[1]
      ball.trajectory.b[0] = snapshot.velocity[0]
      ball.trajectory.b[1] = snapshot.velocity[1]
      ball.trajectory.c[0] = snapshot.position[0]
      ball.trajectory.c[1] = snapshot.position[1]
      if (snapshot.angularAlpha) {
        ball.angularTrajectory.alpha = [...snapshot.angularAlpha]
        ball.angularTrajectory.omega0 = [...snapshot.angularOmega0]
      }

      // Update stored position
      ballPositions.set(snapshot.id, [snapshot.position[0], snapshot.position[1]])
    }

    // Handle ball pocketed: remove from scene
    if (event.type === EventType.BallPocketed) {
      const ballId = event.snapshots[0]?.id
      if (ballId && simulationScene) {
        // Ball will naturally stop rendering since it's removed from physics
        // but we should hide it in the scene
        ballPositions.delete(ballId)
      }
    }
  }

  function startAnimationLoop() {
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)

    function step(timestamp: number) {
      const deltaMs = prevTimestamp ? timestamp - prevTimestamp : 0
      prevTimestamp = timestamp

      // Advance playback
      if (isSimulating) {
        currentProgress += deltaMs / 1000
        while (nextEvent && currentProgress >= nextEvent.time) {
          applyEventSnapshots(nextEvent)
          nextEvent = simulatedResults.shift()
        }
      }

      // 2D canvas rendering
      ctx2D.fillStyle = config.tableColor
      ctx2D.fillRect(0, 0, canvas2D.width, canvas2D.height)

      // Draw trajectory preview
      drawTrajectoryPreview()

      // 3D rendering
      if (simulationScene) {
        simulationScene.renderAtTime(currentProgress)
        renderer.render(simulationScene.scene, simulationScene.camera)
      }

      animationFrameId = requestAnimationFrame(step)
    }

    animationFrameId = requestAnimationFrame(step)
  }

  function cleanupScene() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  }

  function cleanup() {
    cleanupScene()
    ballState = {}
    circleIds = []
    simulatedResults = []
    nextEvent = undefined
    previewResult = null
    isSimulating = false
    ballPositions.clear()
  }

  // Handle window resize
  const resizeHandler = () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    if (simulationScene) {
      simulationScene.camera.aspect = window.innerWidth / window.innerHeight
      simulationScene.camera.updateProjectionMatrix()
    }
  }
  window.addEventListener('resize', resizeHandler)

  // Start the game
  controller.startGame()

  const instance: GameInstance = {
    destroy: () => {
      cleanup()
      controller.destroy()
      if (cueInput) cueInput.destroy()
      window.removeEventListener('resize', resizeHandler)
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement)
      }
      renderer.dispose()
    },
    bridge,
  }

  return instance
}
