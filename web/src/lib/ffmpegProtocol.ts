import type {
  WorkerCommand,
  WorkerErrorMessage,
  WorkerProgressMessage,
  WorkerReadyMessage,
  WorkerRequest,
  WorkerRequestPayloadMap,
  WorkerResponseMessage,
  WorkerResultMessage,
} from './types'

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function buildWorkerRequest<T extends WorkerCommand>(
  command: T,
  payload: WorkerRequestPayloadMap[T],
): WorkerRequest<T> {
  return {
    id: createRequestId(),
    command,
    payload,
  }
}

export function isWorkerResponseMessage(value: unknown): value is WorkerResponseMessage {
  if (!value || typeof value !== 'object') {
    return false
  }
  const maybe = value as Partial<WorkerResponseMessage>
  return typeof maybe.id === 'string' && typeof maybe.event === 'string'
}

export function isReadyMessage(value: WorkerResponseMessage): value is WorkerReadyMessage {
  return value.event === 'ready'
}

export function isProgressMessage(value: WorkerResponseMessage): value is WorkerProgressMessage {
  return value.event === 'progress'
}

export function isResultMessage(value: WorkerResponseMessage): value is WorkerResultMessage {
  return value.event === 'result'
}

export function isErrorMessage(value: WorkerResponseMessage): value is WorkerErrorMessage {
  return value.event === 'error'
}
