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

const BRITISH_COLORS = ['#F5F5F0', '#CC0000', '#1A1A1A', '#FFD700'] // cue, red, black, yellow

const SNOOKER_COLOR_ORDER = ['#F5F5F0', '#CC0000', '#FFD700', '#009944', '#8B4513', '#003DA5', '#FF69B4', '#1A1A1A']

const TEX_SIZE = 512
const textureCache = new Map<string, THREE.CanvasTexture>()

interface RGB {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

export function getTextureSetSize(set: BallTextureSet): number {
  switch (set) {
    case 'american':
      return 16
    case 'british':
      return 16
    case 'snooker':
      return 22
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
      renderAmericanBall(ctx, wrappedIndex)
      break
    case 'british':
      renderSolidBall(ctx, getBritishColor(wrappedIndex))
      break
    case 'snooker':
      renderSolidBall(ctx, getSnookerColor(wrappedIndex))
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

// --- Color lookups ---

function getBritishColor(index: number): RGB {
  if (index === 0) return parseHex(BRITISH_COLORS[0]) // cue
  if (index <= 7) return parseHex(BRITISH_COLORS[1]) // red
  if (index === 8) return parseHex(BRITISH_COLORS[2]) // black
  return parseHex(BRITISH_COLORS[3]) // yellow
}

function getSnookerColor(index: number): RGB {
  if (index === 0) return parseHex(SNOOKER_COLOR_ORDER[0]) // cue
  if (index <= 15) return parseHex(SNOOKER_COLOR_ORDER[1]) // red
  const colorIndex = ((index - 16) % 6) + 2
  return parseHex(SNOOKER_COLOR_ORDER[colorIndex])
}

// --- Rendering ---
// All rendering uses per-pixel equirectangular projection so features
// (circles, stripes) appear undistorted on the sphere.
//
// Three.js SphereGeometry UV mapping:
//   u ∈ [0,1] → longitude φ ∈ [0, 2π]   (seam at u=0 and u=1)
//   v ∈ [0,1] → colatitude θ ∈ [0, π]   (north pole at v=0, south pole at v=1)
//   latitude = π/2 − θ
//
// The number circle is placed at the texture center (u=0.5, v=0.5),
// which maps to longitude π, latitude 0 (equator, opposite the seam).

/** Angular radius of the number circle on the sphere (radians) */
const NUMBER_CIRCLE_RAD = 0.40

/** Half-angle of the stripe band measured from the equator (radians) */
const STRIPE_HALF_ANGLE = 0.72

/** Direction vector for the number circle center: lon=π, lat=0 → (−1, 0, 0) */
const NUM_CENTER_X = -1
const NUM_CENTER_Y = 0
const NUM_CENTER_Z = 0

const COS_NUMBER_CIRCLE = Math.cos(NUMBER_CIRCLE_RAD)

function renderAmericanBall(ctx: CanvasRenderingContext2D, index: number): void {
  const baseColor = parseHex(AMERICAN_COLORS[index])
  const isStripe = index >= 9
  const isCue = index === 0
  const hasNumber = !isCue

  const offWhite: RGB = { r: 245, g: 245, b: 240 }
  const white: RGB = { r: 255, g: 255, b: 255 }

  const imageData = ctx.createImageData(TEX_SIZE, TEX_SIZE)
  const data = imageData.data

  for (let py = 0; py < TEX_SIZE; py++) {
    const v = (py + 0.5) / TEX_SIZE
    const lat = (0.5 - v) * Math.PI // +π/2 at top, −π/2 at bottom
    const cosLat = Math.cos(lat)
    const sinLat = Math.sin(lat)

    for (let px = 0; px < TEX_SIZE; px++) {
      const u = (px + 0.5) / TEX_SIZE
      const lon = u * 2 * Math.PI

      // Determine base pixel color
      let r: number, g: number, b: number
      if (isStripe) {
        if (Math.abs(lat) <= STRIPE_HALF_ANGLE) {
          r = baseColor.r
          g = baseColor.g
          b = baseColor.b
        } else {
          r = offWhite.r
          g = offWhite.g
          b = offWhite.b
        }
      } else {
        r = baseColor.r
        g = baseColor.g
        b = baseColor.b
      }

      // Number circle: angular distance on the sphere from circle center
      if (hasNumber) {
        const sx = cosLat * Math.cos(lon)
        const sy = cosLat * Math.sin(lon)
        const sz = sinLat
        const dot = sx * NUM_CENTER_X + sy * NUM_CENTER_Y + sz * NUM_CENTER_Z
        if (dot > COS_NUMBER_CIRCLE) {
          r = white.r
          g = white.g
          b = white.b
        }
      }

      const idx = (py * TEX_SIZE + px) * 4
      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)

  // Draw number text at the texture center.
  // At the equator the equirectangular projection stretches horizontally
  // by a factor of 2π/π = 2 compared to vertical, so we compress the
  // text width by 0.5 to appear circular on the sphere.
  if (hasNumber) {
    const cx = TEX_SIZE / 2
    const cy = TEX_SIZE / 2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(0.5, 1)
    ctx.fillStyle = '#1A1A1A'
    ctx.font = `bold ${TEX_SIZE * 0.14}px Arial, Helvetica, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(index), 0, TEX_SIZE * 0.005)
    ctx.restore()
  }
}

function renderSolidBall(ctx: CanvasRenderingContext2D, color: RGB): void {
  // Solid-color balls don't distort, so a simple fill is fine
  ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
}
