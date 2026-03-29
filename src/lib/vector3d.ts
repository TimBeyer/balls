type Vector3D = [number, number, number]

export default Vector3D

export function vec3Add(a: Vector3D, b: Vector3D): Vector3D {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function vec3Sub(a: Vector3D, b: Vector3D): Vector3D {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function vec3Scale(v: Vector3D, s: number): Vector3D {
  return [v[0] * s, v[1] * s, v[2] * s]
}

export function vec3Dot(a: Vector3D, b: Vector3D): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function vec3Cross(a: Vector3D, b: Vector3D): Vector3D {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

export function vec3Magnitude(v: Vector3D): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
}

export function vec3MagnitudeSquared(v: Vector3D): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
}

export function vec3Normalize(v: Vector3D): Vector3D {
  const mag = vec3Magnitude(v)
  if (mag === 0) return [0, 0, 0]
  return [v[0] / mag, v[1] / mag, v[2] / mag]
}

export function vec3Zero(): Vector3D {
  return [0, 0, 0]
}

export function vec3Negate(v: Vector3D): Vector3D {
  return [-v[0], -v[1], -v[2]]
}

/** Returns the 2D magnitude of just the x,y components */
export function vec3Magnitude2D(v: Vector3D): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1])
}
