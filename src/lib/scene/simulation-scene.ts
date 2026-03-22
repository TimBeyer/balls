import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Circle from '../circle'
import stringToRGB from '../string-to-rgb'
import { SimulationConfig } from '../config'

class Ball {
  private radius: number
  private sphereMaterial: THREE.MeshStandardMaterial
  public sphere: THREE.Mesh
  private circle: Circle
  private tableWidth: number
  private tableHeight: number

  constructor(circle: Circle, config: SimulationConfig) {
    this.circle = circle
    this.radius = circle.radius
    this.tableWidth = config.tableWidth
    this.tableHeight = config.tableHeight

    this.sphereMaterial = new THREE.MeshStandardMaterial({ color: stringToRGB(this.circle.id), roughness: config.ballRoughness })
    const envMap = new THREE.TextureLoader().load('env-map.png')
    envMap.mapping = THREE.EquirectangularReflectionMapping
    this.sphereMaterial.envMap = envMap

    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, config.ballSegments, config.ballSegments),
      this.sphereMaterial,
    )

    this.sphere.castShadow = true
    this.sphere.receiveShadow = true
  }

  renderAtTime(progress: number) {
    const [x, y] = this.circle.positionAtTime(progress)
    this.sphere.position.x = x - this.tableWidth / 2
    this.sphere.position.y = this.radius
    this.sphere.position.z = y - this.tableHeight / 2
  }

  updateRoughness(roughness: number) {
    this.sphereMaterial.roughness = roughness
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

  constructor(canvas: HTMLCanvasElement, circles: Circle[], config: SimulationConfig, rendererCanvas?: HTMLCanvasElement) {
    this.config = config
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(config.fov, window.innerWidth / window.innerHeight, 1, 10000)
    this.canvas2D = canvas
    this.canvasTexture = new THREE.Texture(this.canvas2D)

    for (const circle of circles) {
      const ball = new Ball(circle, config)
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
  }

  renderAtTime(progress: number) {
    this.controls.update()
    this.canvasTexture.needsUpdate = true
    for (const ball of this.balls) {
      ball.renderAtTime(progress)
    }
  }
}
