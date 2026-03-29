export enum RequestMessageType {
  'INITIALIZE_SIMULATION',
  'REQUEST_SIMULATION_DATA',
  'LOAD_SCENARIO',
}

import type { PhysicsProfileName, PhysicsOverrides } from './config'
import type { Scenario } from './scenarios'
import type { TableConfig } from './table-config'

export interface InitializationRequestPayload {
  numBalls: number
  tableWidth: number
  tableHeight: number
  physicsProfile: PhysicsProfileName
  physicsOverrides?: PhysicsOverrides
  tableConfig?: TableConfig
}

export interface SimulationRequestPayload {
  time: number
}

export interface ScenarioRequestPayload {
  scenario: Scenario
}

export type RequestPayload = InitializationRequestPayload | SimulationRequestPayload | ScenarioRequestPayload

export interface WorkerRequest {
  type: RequestMessageType
  payload: RequestPayload
}

export interface WorkerInitializationRequest extends WorkerRequest {
  type: RequestMessageType.INITIALIZE_SIMULATION
  payload: InitializationRequestPayload
}

export interface WorkerSimulationRequest extends WorkerRequest {
  type: RequestMessageType.REQUEST_SIMULATION_DATA
  payload: SimulationRequestPayload
}

export interface WorkerScenarioRequest extends WorkerRequest {
  type: RequestMessageType.LOAD_SCENARIO
  payload: ScenarioRequestPayload
}

export function isWorkerInitializationRequest(req: WorkerRequest): req is WorkerInitializationRequest {
  return req.type === RequestMessageType.INITIALIZE_SIMULATION
}

export function isWorkerSimulationRequest(req: WorkerRequest): req is WorkerSimulationRequest {
  return req.type === RequestMessageType.REQUEST_SIMULATION_DATA
}

export function isWorkerScenarioRequest(req: WorkerRequest): req is WorkerScenarioRequest {
  return req.type === RequestMessageType.LOAD_SCENARIO
}
