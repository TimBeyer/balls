import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Circle from '../circle'
import stringToRGB from '../string-to-rgb'
import { SimulationConfig } from '../config'
import { generateBallTexture, type BallTextureSet } from './ball-textures'

export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
}

class Ball {
  private radius: number
  private sphereMaterial: THREE.MeshStandardMaterial
  public sphere: THREE.Mesh
  private circle: Circle
  private tableWidth: number
  private tableHeight: number
  private ballIndex: number
  private rotationEnabled: boolean

  // Rotation tracking: accumulate rotation across trajectory segments
  private baseQuaternion = new THREE.Quaternion()
  private lastCircleTime = -1

  constructor(circle: Circle, index: number, config: SimulationConfig) {
    this.circle = circle
    this.radius = circle.radius
    this.tableWidth = config.tableWidth
    this.tableHeight = config.tableHeight
    this.ballIndex = index
    this.rotationEnabled = config.ballRotationEnabled

    this.sphereMaterial = new THREE.MeshStandardMaterial({
      color: stringToRGB(this.circle.id),
      roughness: config.ballRoughness,
    })
    const envMap = new THREE.TextureLoader().load('env-map.png')
    envMap.mapping = THREE.EquirectangularReflectionMapping
    this.sphereMaterial.envMap = envMap

    // Apply texture if a set is configured
    this.applyTexture(config.ballTextureSet)

    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, config.ballSegments, config.ballSegments),
      this.sphereMaterial,
    )

    this.sphere.castShadow = true
    this.sphere.receiveShadow = true
  }

  renderAtTime(progress: number) {
    const pos = this.circle.position3DAtTime(progress)
    this.sphere.position.x = pos[0] - this.tableWidth / 2
    this.sphere.position.y = this.radius + Math.max(0, pos[2])
    this.sphere.position.z = pos[1] - this.tableHeight / 2

    if (!this.rotationEnabled) return

    // Accumulate rotation from previous trajectory segments
    const circleTime = this.circle.time
    if (this.lastCircleTime >= 0 && circleTime !== this.lastCircleTime) {
      // Trajectory changed — snapshot the current rotation as the new base.
      // The last renderAtTime call already applied the correct incremental rotation
      // up to the previous frame, so we just carry that forward.
      this.baseQuaternion.copy(this.sphere.quaternion)
    }
    this.lastCircleTime = circleTime

    // Compute incremental rotation for the current segment
    const dt = progress - circleTime
    if (dt > 1e-9) {
      const angTraj = this.circle.angularTrajectory
      // Integrated angle: theta(dt) = alpha * dt^2/2 + omega0 * dt
      const angleX = angTraj.alpha[0] * dt * dt * 0.5 + angTraj.omega0[0] * dt
      const angleY = angTraj.alpha[1] * dt * dt * 0.5 + angTraj.omega0[1] * dt
      const angleZ = angTraj.alpha[2] * dt * dt * 0.5 + angTraj.omega0[2] * dt

      // Convert physics coords to Three.js coords:
      // Physics X → Three.js X, Physics Y → Three.js -Z, Physics Z → Three.js Y
      const incrementalQ = new THREE.Quaternion()
      const euler = new THREE.Euler(angleX, angleZ, -angleY, 'XYZ')
      incrementalQ.setFromEuler(euler)

      this.sphere.quaternion.copy(this.baseQuaternion).multiply(incrementalQ)
    } else {
      this.sphere.quaternion.copy(this.baseQuaternion)
    }
  }

  updateRoughness(roughness: number) {
    this.sphereMaterial.roughness = roughness
  }

  applyTexture(set: BallTextureSet) {
    const texture = generateBallTexture(this.ballIndex, set)
    if (texture) {
      this.sphereMaterial.map = texture
      this.sphereMaterial.color.set('#ffffff')
    } else {
      this.sphereMaterial.map = null
      this.sphereMaterial.color.set(stringToRGB(this.circle.id))
    }
    this.sphereMaterial.needsUpdate = true
  }

  setRotationEnabled(enabled: boolean) {
    this.rotationEnabled = enabled
    if (!enabled) {
      this.sphere.quaternion.identity()
      this.baseQuaternion.identity()
    }
  }

  resetRotation() {
    this.baseQuaternion.identity()
    this.sphere.quaternion.identity()
    this.lastCircleTime = -1
  }
}

export default class SimulationScene {
  public scene: THREE.Scene
  public camera: THREE.PerspectiveCamera
  private balls: Ball[] = []
  private controls: OrbitControls
  private canvas2D: HTMLCanvasElement
  private canvasTexture: THREE.Texture
  private spotLight1: THREE.SpotLight
  private spotLight2: THREE.SpotLight
  private config: SimulationConfig
  private currentTextureSet: BallTextureSet

  constructor(canvas: HTMLCanvasElement, circles: Circle[], config: SimulationConfig, rendererCanvas?: HTMLCanvasElement) {
    this.config = config
    this.currentTextureSet = config.ballTextureSet
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(config.fov, window.innerWidth / window.innerHeight, 1, 10000)
    this.canvas2D = canvas
    this.canvasTexture = new THREE.Texture(this.canvas2D)

    for (let i = 0; i < circles.length; i++) {
      const ball = new Ball(circles[i], i, config)
      this.balls.push(ball)
      this.scene.add(ball.sphere)
    }

    const { controls, spotLight1, spotLight2 } = this.initialize(rendererCanvas)
    this.controls = controls
    this.spotLight1 = spotLight1
    this.spotLight2 = spotLight2
  }

  private initialize(rendererCanvas?: HTMLCanvasElement) {
    this.canvasTexture.minFilter = THREE.LinearFilter
    const material = new THREE.MeshPhongMaterial({ map: this.canvasTexture })
    const geometry = new THREE.BoxGeometry(this.config.tableWidth, 1, this.config.tableHeight)
    const mesh = new THREE.Mesh(geometry, material)
    this.scene.add(mesh)

    mesh.receiveShadow = true

    this.camera.position.x = 0
    this.camera.position.y = 1500
    this.camera.position.z = 100
    this.camera.lookAt(new THREE.Vector3(0, 0, 0))

    const spotLight1 = new THREE.SpotLight(
      0xffffff,
      this.config.lightIntensity,
      3000,
      this.config.lightAngle,
      this.config.lightPenumbra,
      this.config.lightDecay,
    )
    spotLight1.position.set(-400, this.config.lightHeight, 0)
    spotLight1.target.position.x = -400
    this.scene.add(spotLight1.target)
    spotLight1.castShadow = true
    spotLight1.shadow.mapSize.width = this.config.shadowMapSize
    spotLight1.shadow.mapSize.height = this.config.shadowMapSize
    this.scene.add(spotLight1)

    const spotLight2 = new THREE.SpotLight(
      0xffffff,
      this.config.lightIntensity,
      3000,
      this.config.lightAngle,
      this.config.lightPenumbra,
      this.config.lightDecay,
    )
    spotLight2.position.set(400, this.config.lightHeight, 0)
    spotLight2.target.position.x = 400
    this.scene.add(spotLight2.target)
    spotLight2.castShadow = true
    spotLight2.shadow.mapSize.width = this.config.shadowMapSize
    spotLight2.shadow.mapSize.height = this.config.shadowMapSize
    this.scene.add(spotLight2)

    const domElement = rendererCanvas ?? document.querySelector('canvas')!
    const controls = new OrbitControls(this.camera, domElement)
    controls.enableZoom = true
    controls.enablePan = true
    controls.enableDamping = false

    return { controls, spotLight1, spotLight2 }
  }

  getCameraState(): CameraState {
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
    }
  }

  restoreCamera(state: CameraState) {
    this.camera.position.set(state.position[0], state.position[1], state.position[2])
    this.controls.target.set(state.target[0], state.target[1], state.target[2])
    this.controls.update()
  }

  updateFromConfig(config: SimulationConfig) {
    this.config = config

    // Camera
    this.camera.fov = config.fov
    this.camera.updateProjectionMatrix()

    // Lighting
    for (const light of [this.spotLight1, this.spotLight2]) {
      light.intensity = config.lightIntensity
      light.angle = config.lightAngle
      light.penumbra = config.lightPenumbra
      light.decay = config.lightDecay
      light.position.y = config.lightHeight
      light.shadow.mapSize.width = config.shadowMapSize
      light.shadow.mapSize.height = config.shadowMapSize
    }

    // Ball roughness
    for (const ball of this.balls) {
      ball.updateRoughness(config.ballRoughness)
    }

    // Texture set change (live, no restart needed)
    if (config.ballTextureSet !== this.currentTextureSet) {
      this.currentTextureSet = config.ballTextureSet
      for (const ball of this.balls) {
        ball.applyTexture(config.ballTextureSet)
      }
    }

    // Rotation toggle
    for (const ball of this.balls) {
      ball.setRotationEnabled(config.ballRotationEnabled)
    }
  }

  renderAtTime(progress: number) {
    this.controls.update()
    this.canvasTexture.needsUpdate = true
    for (const ball of this.balls) {
      ball.renderAtTime(progress)
    }
  }
}
