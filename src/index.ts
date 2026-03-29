/**
 * Application entry point — routes between game modes and sandbox.
 *
 * Hash-based routing:
 *   (empty / #menu)      → Main menu
 *   #sandbox              → Debug sandbox (original mode)
 *   #game/eight-ball      → 8-Ball Pool
 *   #game/nine-ball       → 9-Ball Pool
 *   #game/snooker         → Snooker
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MainMenu, type GameMode } from './ui/components/MainMenu'
import { GameUI } from './ui/components/GameUI'
import { startGame, type GameInstance } from './game'
import { startSandbox, type SandboxInstance } from './sandbox'
import { EightBallRules } from './lib/game/rules-eight-ball'
import { NineBallRules } from './lib/game/rules-nine-ball'
import { SnookerRules } from './lib/game/rules-snooker'
import type { GameRules } from './lib/game/rules'

let sandboxInstance: SandboxInstance | null = null
let gameInstance: GameInstance | null = null
let reactRoot: Root | null = null
let uiContainer: HTMLDivElement | null = null

function getUIContainer(): HTMLDivElement {
  if (!uiContainer) {
    uiContainer = document.createElement('div')
    uiContainer.id = 'ui-root'
    uiContainer.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;'
    document.body.appendChild(uiContainer)
  }
  return uiContainer
}

function getReactRoot(): Root {
  if (!reactRoot) {
    reactRoot = createRoot(getUIContainer())
  }
  return reactRoot
}

function teardown() {
  if (sandboxInstance) {
    sandboxInstance.destroy()
    sandboxInstance = null
  }
  if (gameInstance) {
    gameInstance.destroy()
    gameInstance = null
  }
}

function getRulesForMode(mode: GameMode): GameRules {
  switch (mode) {
    case 'eight-ball':
      return new EightBallRules()
    case 'nine-ball':
      return new NineBallRules()
    case 'snooker':
      return new SnookerRules()
  }
}

function showMenu() {
  teardown()

  getReactRoot().render(
    createElement(MainMenu, {
      onStartGame: (mode: GameMode) => {
        window.location.hash = `game/${mode}`
      },
      onSandbox: () => {
        window.location.hash = 'sandbox'
      },
    }),
  )
}

function launchGame(mode: GameMode) {
  teardown()

  const rules = getRulesForMode(mode)
  gameInstance = startGame(rules, document.body)

  getReactRoot().render(createElement(GameUI, { bridge: gameInstance.bridge }))
}

function launchSandbox() {
  teardown()

  // Hide React UI for sandbox (it has its own overlay)
  getReactRoot().render(null)

  sandboxInstance = startSandbox(document.body)
}

function route() {
  const hash = window.location.hash.replace(/^#/, '')

  if (hash === 'sandbox') {
    launchSandbox()
  } else if (hash.startsWith('game/')) {
    const mode = hash.replace('game/', '') as GameMode
    if (['eight-ball', 'nine-ball', 'snooker'].includes(mode)) {
      launchGame(mode)
    } else {
      showMenu()
    }
  } else {
    showMenu()
  }
}

// Listen for hash changes
window.addEventListener('hashchange', route)

// Initial route
route()
