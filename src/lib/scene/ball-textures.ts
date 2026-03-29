import * as THREE from 'three'

export type BallTextureSet = 'none' | 'american' | 'british' | 'snooker'

export const BALL_TEXTURE_SETS: { label: string; value: BallTextureSet }[] = [
  { label: 'American Pool', value: 'american' },
  { label: 'British Pool', value: 'british' },
  { label: 'Snooker', value: 'snooker' },
  { label: 'None (solid colors)', value: 'none' },
]

// American pool ball colors (index 0 = cue ball)
const AMERICAN_COLORS = [
  '#F5F5F0', // 0: cue ball (off-white)
  '#FFC300', // 1: yellow
  '#003DA5', // 2: blue
  '#D1001C', // 3: red
  '#4B0082', // 4: purple
  '#FF6600', // 5: orange
  '#006400', // 6: green
  '#800000', // 7: maroon
  '#1A1A1A', // 8: black (8-ball)
  '#FFC300', // 9: yellow stripe
  '#003DA5', // 10: blue stripe
  '#D1001C', // 11: red stripe
  '#4B0082', // 12: purple stripe
  '#FF6600', // 13: orange stripe
  '#006400', // 14: green stripe
  '#800000', // 15: maroon stripe
]

// British pool: 0=cue, 1-7=red, 8=black, 9-15=yellow
const BRITISH_RED = '#CC0000'
const BRITISH_YELLOW = '#FFD700'
const BRITISH_BLACK = '#1A1A1A'
const BRITISH_CUE = '#F5F5F0'

// Snooker: 0=cue, 1-15=red, 16=yellow, 17=green, 18=brown, 19=blue, 20=pink, 21=black
const SNOOKER_COLORS: Record<string, string> = {
  cue: '#F5F5F0',
  red: '#CC0000',
  yellow: '#FFD700',
  green: '#009944',
  brown: '#8B4513',
  blue: '#003DA5',
  pink: '#FF69B4',
  black: '#1A1A1A',
}

const TEX_SIZE = 512
const textureCache = new Map<string, THREE.CanvasTexture>()

export function getTextureSetSize(set: BallTextureSet): number {
  switch (set) {
    case 'american':
      return 16 // cue + 15 balls
    case 'british':
      return 16 // cue + 7 red + 1 black + 7 yellow
    case 'snooker':
      return 22 // cue + 15 reds + 6 colors
    case 'none':
      return 0
  }
}

export function generateBallTexture(index: number, set: BallTextureSet): THREE.CanvasTexture | null {
  if (set === 'none') return null

  const size = getTextureSetSize(set)
  const wrappedIndex = index % size

  const key = `${set}-${wrappedIndex}`
  const cached = textureCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = TEX_SIZE
  canvas.height = TEX_SIZE
  const ctx = canvas.getContext('2d')!

  switch (set) {
    case 'american':
      drawAmericanBall(ctx, wrappedIndex)
      break
    case 'british':
      drawBritishBall(ctx, wrappedIndex)
      break
    case 'snooker':
      drawSnookerBall(ctx, wrappedIndex)
      break
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  textureCache.set(key, texture)
  return texture
}

export function clearTextureCache(): void {
  for (const tex of textureCache.values()) {
    tex.dispose()
  }
  textureCache.clear()
}

// --- American Pool ---

function drawAmericanBall(ctx: CanvasRenderingContext2D, index: number): void {
  const color = AMERICAN_COLORS[index]
  const isStripe = index >= 9
  const isCue = index === 0

  if (isCue) {
    // Cue ball: plain off-white with subtle shading
    drawSolidBall(ctx, color)
    return
  }

  if (isStripe) {
    // Stripe balls: white base with colored band in the middle
    drawSolidBall(ctx, '#F5F5F0')
    drawStripe(ctx, color)
    drawNumberCircle(ctx, index)
  } else {
    // Solid balls: full color with number circle
    drawSolidBall(ctx, color)
    drawNumberCircle(ctx, index)
  }
}

function drawSolidBall(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)

  // Add subtle gradient for depth
  const gradient = ctx.createRadialGradient(
    TEX_SIZE * 0.4,
    TEX_SIZE * 0.35,
    TEX_SIZE * 0.05,
    TEX_SIZE * 0.5,
    TEX_SIZE * 0.5,
    TEX_SIZE * 0.55,
  )
  gradient.addColorStop(0, 'rgba(255,255,255,0.15)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
}

function drawStripe(ctx: CanvasRenderingContext2D, color: string): void {
  // Draw a horizontal band covering the middle ~45% of the texture
  const bandTop = TEX_SIZE * 0.275
  const bandBottom = TEX_SIZE * 0.725
  ctx.fillStyle = color
  ctx.fillRect(0, bandTop, TEX_SIZE, bandBottom - bandTop)
}

function drawNumberCircle(ctx: CanvasRenderingContext2D, number: number): void {
  const cx = TEX_SIZE / 2
  const cy = TEX_SIZE / 2
  const r = TEX_SIZE * 0.12

  // White circle background
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  // Thin border
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.stroke()

  // Number text
  ctx.fillStyle = '#1A1A1A'
  ctx.font = `bold ${TEX_SIZE * 0.13}px Arial, Helvetica, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(number), cx, cy + TEX_SIZE * 0.005)
}

// --- British Pool ---

function drawBritishBall(ctx: CanvasRenderingContext2D, index: number): void {
  let color: string
  if (index === 0) {
    color = BRITISH_CUE
  } else if (index <= 7) {
    color = BRITISH_RED
  } else if (index === 8) {
    color = BRITISH_BLACK
  } else {
    color = BRITISH_YELLOW
  }
  drawSolidBall(ctx, color)
}

// --- Snooker ---

function drawSnookerBall(ctx: CanvasRenderingContext2D, index: number): void {
  let color: string
  if (index === 0) {
    color = SNOOKER_COLORS.cue
  } else if (index <= 15) {
    color = SNOOKER_COLORS.red
  } else {
    // Color balls in order: yellow, green, brown, blue, pink, black
    const colorNames = ['yellow', 'green', 'brown', 'blue', 'pink', 'black']
    const colorIndex = index - 16
    color = SNOOKER_COLORS[colorNames[colorIndex % colorNames.length]]
  }
  drawSolidBall(ctx, color)
}
