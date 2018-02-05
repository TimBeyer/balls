
export enum RequestMessageType {
  'INITIALIZE_SIMULATION',
  'REQUEST_SIMULATION_DATA'
}

export interface InitializationRequestPayload {
  numBalls: number,
  tableWidth: number,
  tableHeight: number
}

export interface SimulationRequestPayload {
  time: number
}

export type RequestPayload = InitializationRequestPayload | SimulationRequestPayload

export interface WorkerRequest {
  type: RequestMessageType,
  payload: RequestPayload
}

export interface WorkerInitializationRequest extends WorkerRequest {
  type: RequestMessageType.INITIALIZE_SIMULATION,
  payload: InitializationRequestPayload
}

export interface WorkerSimulationRequest extends WorkerRequest {
  type: RequestMessageType.REQUEST_SIMULATION_DATA,
  payload: SimulationRequestPayload
}

export function isWorkerInitializationRequest (req: WorkerRequest): req is WorkerInitializationRequest {
  return req.type === RequestMessageType.INITIALIZE_SIMULATION
}

export function isWorkerSimulationRequest(req: WorkerRequest): req is WorkerSimulationRequest {
  return req.type === RequestMessageType.REQUEST_SIMULATION_DATA
}