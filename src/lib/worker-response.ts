import { ReplayData } from "./simulation";

export enum ResponseMessageType {
  'SIMULATION_INITIALIZED',
  'SIMULATION_DATA'
}

export interface InitializationResponsePayload {
  status: boolean
  numBalls: number
  tableWidth: number
  tableHeight: number
}

export interface SimulationResponsePayload {
  initialValues?: ReplayData
  data: ReplayData[]
}

export type ResponsePayload = InitializationResponsePayload | SimulationResponsePayload

export interface WorkerResponse {
  type: ResponseMessageType,
  payload: ResponsePayload
}

export interface WorkerInitializationResponse extends WorkerResponse {
  type: ResponseMessageType.SIMULATION_INITIALIZED,
  payload: InitializationResponsePayload
}

export interface WorkerSimulationResponse extends WorkerResponse {
  type: ResponseMessageType.SIMULATION_DATA,
  payload: SimulationResponsePayload
}

export function isWorkerInitializationResponse(req: WorkerResponse): req is WorkerInitializationResponse {
  return req.type === ResponseMessageType.SIMULATION_INITIALIZED
}

export function isWorkerSimulationResponse(req: WorkerResponse): req is WorkerSimulationResponse {
  return req.type === ResponseMessageType.SIMULATION_DATA
}