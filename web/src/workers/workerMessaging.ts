import type {
  WorkerArtifactData,
  WorkerCommand,
  WorkerErrorMessage,
  WorkerProgressMessage,
  WorkerResultMessage,
} from '../lib/types'

declare const self: DedicatedWorkerGlobalScope

export type WorkerProgressSink = (id: string, stage: string, message: string) => void

export function postProgress(id: string, stage: string, message: string): void {
  const payload: WorkerProgressMessage = {
    id,
    event: 'progress',
    payload: {
      stage,
      message,
    },
  }
  self.postMessage(payload)
}

export function postResult<T extends WorkerCommand>(
  id: string,
  command: T,
  data: WorkerResultMessage<T>['payload']['data'],
): void {
  const payload: WorkerResultMessage<T> = {
    id,
    event: 'result',
    payload: {
      command,
      data,
    },
  }

  const maybeWithFileBytes = data as Partial<WorkerArtifactData>
  if (maybeWithFileBytes.fileBytes instanceof Uint8Array) {
    self.postMessage(payload, [maybeWithFileBytes.fileBytes.buffer])
    return
  }

  self.postMessage(payload)
}

export function postError(id: string, command: WorkerCommand, message: string): void {
  const payload: WorkerErrorMessage = {
    id,
    event: 'error',
    payload: {
      command,
      message,
    },
  }
  self.postMessage(payload)
}
