import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Circle from '../circle'
import stringToRGB from '../string-to-rgb'

class Ball {
  private radius: number
  private segments = 32
  private rings = 32
  private sphereMaterial: THREE.MeshStandardMaterial
  public sphere: THREE.Mesh
  private circle: Circle

  constructor(circle: Circle) {
    this.circle = circle
    this.radius = circle.radius

    this.sphereMaterial = new THREE.MeshStandardMaterial({ color: stringToRGB(this.circle.id), roughness: 0 })
    const envMap = new THREE.TextureLoader().load('env-map.png')
    envMap.mapping = THREE.EquirectangularReflectionMapping
    this.sphereMaterial.envMap = envMap

    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(this.radius, this.segments, this.rings), this.sphereMaterial)

    this.sphere.castShadow = true
    this.sphere.receiveShadow = true
  }

  renderAtTime(progress: number) {
    const [x, y] = this.circle.positionAtTime(progress)
    this.sphere.position.x = x - 2840 / 2
    this.sphere.position.y = this.radius
    this.sphere.position.z = y - 1420 / 2
  }
}

export default class SimulationScene {
  public scene: THREE.Scene
  public camera: THREE.PerspectiveCamera
  private balls: Ball[] = []
  private controls: OrbitControls
  private canvas2D: HTMLCanvasElement
  private canvasTexture: THREE.Texture

  constructor(canvas: HTMLCanvasElement, circles: Circle[]) {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000)
    this.canvas2D = canvas
    this.canvasTexture = new THREE.Texture(this.canvas2D)

    for (const circle of circles) {
      const ball = new Ball(circle)
      this.balls.push(ball)
      this.scene.add(ball.sphere)
    }

    this.controls = this.initialize()
  }

  private initialize(): OrbitControls {
    this.canvasTexture.minFilter = THREE.LinearFilter
    const material = new THREE.MeshPhongMaterial({ map: this.canvasTexture })
    const geometry = new THREE.BoxGeometry(2840, 1, 1420)
    const mesh = new THREE.Mesh(geometry, material)
    this.scene.add(mesh)

    mesh.receiveShadow = true

    this.camera.position.x = 0
    this.camera.position.y = 1500
    this.camera.position.z = 100
    this.camera.lookAt(new THREE.Vector3(0, 0, 0))

    const spotLight = new THREE.SpotLight(0xffffff, 1, 3000, 0.9, 0.6, 0.1)
    spotLight.position.set(-400, 1200, 0)
    spotLight.target.position.x = -400
    this.scene.add(spotLight.target)

    spotLight.castShadow = true
    spotLight.shadow.mapSize.width = 1024
    spotLight.shadow.mapSize.height = 1024

    this.scene.add(spotLight)

    const spotLight2 = new THREE.SpotLight(0xffffff, 1, 3000, 0.9, 0.6, 0.1)
    spotLight2.position.set(400, 1200, 0)
    spotLight2.target.position.x = 400
    this.scene.add(spotLight2.target)

    spotLight2.castShadow = true
    spotLight2.shadow.mapSize.width = 1024
    spotLight2.shadow.mapSize.height = 1024

    this.scene.add(spotLight2)

    const controls = new OrbitControls(this.camera, document.querySelector('canvas')!)
    controls.enableZoom = true
    controls.enablePan = true
    controls.enableDamping = false

    return controls
  }

  renderAtTime(progress: number) {
    this.controls.update()
    this.canvasTexture.needsUpdate = true
    for (const ball of this.balls) {
      ball.renderAtTime(progress)
    }
  }
}
