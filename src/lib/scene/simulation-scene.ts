import * as THREE from 'three';
import * as TrackballControls from 'three-trackballcontrols'
import Circle from '../circle';
import { PerspectiveCamera } from 'three';
import stringToRGB from "../string-to-rgb";

class Ball {
  private radius: number
  private segments = 32
  private rings = 32
  private sphereMaterial: THREE.MeshStandardMaterial
  public sphere: THREE.Mesh
  private circle: Circle

  constructor (circle: Circle) {
    this.circle = circle
    this.radius = circle.radius

    // this.sphereMaterial = new THREE.MeshLambertMaterial({
    //   color: 0xCC0000
    // });
    this.sphereMaterial = new THREE.MeshStandardMaterial({ color: stringToRGB(this.circle.id), roughness: 0});
    const envMap = new THREE.TextureLoader().load('env-map.png');
    envMap.mapping = THREE.SphericalReflectionMapping;
    this.sphereMaterial.envMap = envMap;

    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(
      this.radius,
      this.segments,
      this.rings
    ), this.sphereMaterial);

    this.sphere.castShadow = true;
    this.sphere.receiveShadow = true;
  }

  renderAtTime (progress: number) {
    const [x, y] = this.circle.positionAtTime(progress)
    // console.log(progress, x, y)
    this.sphere.position.x = x - 2840 / 2
    this.sphere.position.y = this.radius;
    this.sphere.position.z = y - 1420 / 2

  }
}

export default class SimulationScene {
  public scene: THREE.Scene
  public camera: THREE.Camera
  private balls: Ball[] = []
  private controls: TrackballControls
  private canvas2D: HTMLCanvasElement
  private canvasTexture: THREE.Texture

  constructor (canvas: HTMLCanvasElement, circles: Circle[]) {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
    this.canvas2D = canvas

    for (const circle of circles) {
      const ball = new Ball(circle)
      this.balls.push(ball)
      this.scene.add(ball.sphere)
    }
    this.initialize()
  }

  initialize () {
    // this.scene.background = new THREE.Color(0xcccccc);
    // this.scene.fog = new THREE.FogExp2(0xcccccc, 0.002);

    this.canvasTexture = new THREE.Texture(this.canvas2D);
    this.canvasTexture.minFilter = THREE.LinearFilter
    const material = new THREE.MeshPhongMaterial({ map: this.canvasTexture });
    const geometry = new THREE.BoxGeometry(2840, 1, 1420);
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);

    mesh.receiveShadow = true;

   
    this.camera.position.x = 0
    this.camera.position.y = 1500;
    this.camera.position.z = 100
    this.camera.lookAt(new THREE.Vector3(0, 0, 0))
    // add to the scene

    const spotLight = new THREE.SpotLight(0xffffff, 1, 3000, .9, 0.6, 0.1);
    spotLight.position.set(-400, 1200, 0);
    spotLight.target.position.x = -400
    this.scene.add(spotLight.target);

    var spotLightHelper = new THREE.SpotLightHelper(spotLight);
    // this.scene.add(spotLightHelper);

    spotLight.castShadow = true;

    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;

    (spotLight.shadow.camera as PerspectiveCamera).near = 10;
    (spotLight.shadow.camera as PerspectiveCamera).far = 5000;
    (spotLight.shadow.camera as PerspectiveCamera).fov = 30;
    // spotLight.shadowCameraVisible = true;


    this.scene.add(spotLight);

    const spotLight2 = new THREE.SpotLight(0xffffff, 1, 3000, .9, 0.6, 0.1);
    spotLight2.position.set(400, 1200, 0);
    spotLight2.target.position.x = 400
    this.scene.add(spotLight2.target);

    var spotLightHelper2 = new THREE.SpotLightHelper(spotLight2);
    // this.scene.add(spotLightHelper2);

    spotLight2.castShadow = true;

    spotLight2.shadow.mapSize.width = 1024;
    spotLight2.shadow.mapSize.height = 1024;

    (spotLight2.shadow.camera as PerspectiveCamera).near = 10;
    (spotLight2.shadow.camera as PerspectiveCamera).far = 5000;
    (spotLight2.shadow.camera as PerspectiveCamera).fov = 30;
    // spotLight.shadowCameraVisible = true;


    this.scene.add(spotLight2);

    // this.camera.position.z = 600;
    // this.camera.position.y = 600
    const controls = new TrackballControls(this.camera, document.querySelector('canvas'));
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;

    controls.noZoom = false;
    controls.noPan = false;

    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;

    controls.keys = [65, 83, 68];
    this.controls = controls

  }

  renderAtTime (progress: number) {
    this.controls.update()
    this.canvasTexture.needsUpdate = true
    for (const ball of this.balls) {
      ball.renderAtTime(progress)
    }
  }
}
