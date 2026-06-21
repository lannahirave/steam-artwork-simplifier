import {
  buildWorkerRequest,
  isErrorMessage,
  isMemoryDebugMessage,
  isProgressMessage,
  isResultMessage,
  isWorkerResponseMessage,
} from './ffmpegProtocol'
import type {
  MemoryDebugEventData,
  WorkerCommand,
  WorkerRequestPayloadMap,
  WorkerResultDataMap,
  WorkerResponseMessage,
} from './types'

type ProgressCallback = (message: string, stage: string, workerIndex: number) => void
type MemoryDebugCallback = (event: MemoryDebugEventData, workerIndex: number) => void

export class FinishCurrentConversionError extends Error {
  constructor(message = 'Finishing current conversion') {
    super(message)
    this.name = 'FinishCurrentConversionError'
  }
}

export function isFinishCurrentConversionError(error: unknown): error is FinishCurrentConversionError {
  return error instanceof FinishCurrentConversionError ||
    (error instanceof Error && error.name === 'FinishCurrentConversionError')
}

interface TaskRecord {
  requestId: string
  command: WorkerCommand
  payload: WorkerRequestPayloadMap[WorkerCommand]
  transferables: Transferable[]
  onProgress?: ProgressCallback
  onMemoryDebug?: MemoryDebugCallback
  affinityKey?: string
  timeoutMs: number
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

interface InFlightTask {
  workerIndex: number
  command: WorkerCommand
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  onProgress?: ProgressCallback
  onMemoryDebug?: MemoryDebugCallback
  timeoutId?: ReturnType<typeof setTimeout>
}

interface WorkerSlot {
  worker: Worker
  busy: boolean
}

export interface WorkerPoolOptions {
  workerCount: number
  workerFactory?: () => Worker
}

const DEFAULT_WORKER_FACTORY = () =>
  new Worker(new URL('../workers/ffmpeg.worker.ts', import.meta.url), { type: 'module' })

export class ConversionWorkerPool {
  private readonly workerFactory: () => Worker
  private readonly workerCount: number
  private slots: WorkerSlot[] = []
  private queue: TaskRecord[] = []
  private inFlight = new Map<string, InFlightTask>()
  private affinitySlots = new Map<string, number>()
  private warmedUp = false
  private finishingCurrent = false
  private finishWaiters: Array<() => void> = []

  constructor(options: WorkerPoolOptions) {
    this.workerCount = Math.max(1, options.workerCount)
    this.workerFactory = options.workerFactory ?? DEFAULT_WORKER_FACTORY
    this.createSlots()
  }

  get size(): number {
    return this.workerCount
  }

  async warmup(): Promise<void> {
    if (this.warmedUp) {
      return
    }
    const initCalls = Array.from({ length: this.workerCount }, () =>
      this.runTask('init', {}, { onProgress: undefined, timeoutMs: 120_000 }),
    )
    await Promise.all(initCalls)
    this.warmedUp = true
  }

  async clearFrameCaches(options?: {
    memoryDebugEnabled?: boolean
    onMemoryDebug?: MemoryDebugCallback
  }): Promise<void> {
    const clearCalls = Array.from({ length: this.workerCount }, (_, workerIndex) =>
      this.runTask('clearFrameCache', {
        memoryDebugEnabled: options?.memoryDebugEnabled,
      }, {
        affinityKey: `clear-frame-cache:${workerIndex}`,
        onMemoryDebug: options?.onMemoryDebug,
        timeoutMs: 30_000,
      }),
    )
    await Promise.all(clearCalls)
  }

  runTask<T extends WorkerCommand>(
    command: T,
    payload: WorkerRequestPayloadMap[T],
    options?: {
      onProgress?: ProgressCallback
      onMemoryDebug?: MemoryDebugCallback
      transferables?: Transferable[]
      timeoutMs?: number
      affinityKey?: string
    },
  ): Promise<WorkerResultDataMap[T]> {
    const request = buildWorkerRequest(command, payload)
    return new Promise<WorkerResultDataMap[T]>((resolve, reject) => {
      if (this.finishingCurrent) {
        reject(new FinishCurrentConversionError())
        return
      }

      const task: TaskRecord = {
        requestId: request.id,
        command,
        payload: payload as WorkerRequestPayloadMap[WorkerCommand],
        transferables: options?.transferables ?? [],
        onProgress: options?.onProgress,
        onMemoryDebug: options?.onMemoryDebug,
        affinityKey: options?.affinityKey,
        timeoutMs: options?.timeoutMs ?? 0,
        resolve: resolve as (value: unknown) => void,
        reject,
      }

      this.queue.push(task)
      this.dispatch()
    })
  }

  cancelAll(reason = 'Cancelled by user'): void {
    this.finishingCurrent = false
    this.finishWaiters.splice(0).forEach((resolve) => resolve())

    for (const task of this.queue) {
      task.reject(new Error(reason))
    }
    this.queue = []

    for (const [requestId, task] of this.inFlight.entries()) {
      if (task.timeoutId) {
        clearTimeout(task.timeoutId)
      }
      task.reject(new Error(reason))
      this.inFlight.delete(requestId)
    }

    this.resetWorkers()
    this.warmedUp = false
  }

  finishCurrent(reason = 'Finishing current conversion'): Promise<void> {
    if (this.queue.length === 0 && this.inFlight.size === 0) {
      this.finishingCurrent = false
      return Promise.resolve()
    }

    this.finishingCurrent = true
    for (const task of this.queue) {
      task.reject(new FinishCurrentConversionError(reason))
    }
    this.queue = []

    if (this.inFlight.size === 0) {
      this.finishingCurrent = false
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.finishWaiters.push(() => {
        this.finishingCurrent = false
        resolve()
      })
    })
  }

  dispose(): void {
    this.cancelAll('Worker pool disposed')
  }

  private createSlots(): void {
    this.slots = Array.from({ length: this.workerCount }, () => {
      const worker = this.workerFactory()
      return {
        worker,
        busy: false,
      }
    })

    this.slots.forEach((_, workerIndex) => {
      this.bindWorkerHandlers(workerIndex)
    })
  }

  private resetWorkers(): void {
    for (const slot of this.slots) {
      slot.worker.terminate()
    }
    this.createSlots()
  }

  private rejectTasksForWorker(workerIndex: number, reason: string): void {
    for (const [requestId, task] of this.inFlight.entries()) {
      if (task.workerIndex !== workerIndex) {
        continue
      }
      if (task.timeoutId) {
        clearTimeout(task.timeoutId)
      }
      task.reject(new Error(reason))
      this.inFlight.delete(requestId)
    }

    const slot = this.slots[workerIndex]
    if (slot) {
      slot.busy = false
    }
    this.resolveFinishWaitersIfIdle()
    this.dispatch()
  }

  private bindWorkerHandlers(workerIndex: number): void {
    const slot = this.slots[workerIndex]
    slot.worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      this.handleWorkerMessage(workerIndex, event.data)
    }
    slot.worker.onerror = (event) => {
      const reason = event.message || 'Worker crashed'
      this.rejectTasksForWorker(workerIndex, reason)
      this.replaceWorker(workerIndex)
    }
  }

  private replaceWorker(workerIndex: number): void {
    const current = this.slots[workerIndex]
    current.worker.terminate()
    this.slots[workerIndex] = {
      worker: this.workerFactory(),
      busy: false,
    }
    this.bindWorkerHandlers(workerIndex)
  }

  private handleWorkerMessage(workerIndex: number, data: WorkerResponseMessage): void {
    if (!isWorkerResponseMessage(data)) {
      return
    }

    const task = this.inFlight.get(data.id)
    if (!task) {
      return
    }

    if (isProgressMessage(data)) {
      task.onProgress?.(data.payload.message, data.payload.stage, workerIndex)
      return
    }

    if (isMemoryDebugMessage(data)) {
      task.onMemoryDebug?.(data.payload, workerIndex)
      return
    }

    if (isErrorMessage(data)) {
      if (task.timeoutId) {
        clearTimeout(task.timeoutId)
      }
      task.reject(new Error(data.payload.message))
      this.inFlight.delete(data.id)
      this.slots[workerIndex].busy = false
      this.resolveFinishWaitersIfIdle()
      this.dispatch()
      return
    }

    if (isResultMessage(data)) {
      if (task.timeoutId) {
        clearTimeout(task.timeoutId)
      }
      task.resolve(data.payload.data)
      this.inFlight.delete(data.id)
      this.slots[workerIndex].busy = false
      this.resolveFinishWaitersIfIdle()
      this.dispatch()
      return
    }
  }

  private dispatch(): void {
    if (this.finishingCurrent) {
      return
    }

    for (let i = 0; i < this.slots.length; i += 1) {
      if (this.queue.length === 0) {
        return
      }

      const slot = this.slots[i]
      if (slot.busy) {
        continue
      }

      const task = this.takeNextTaskForWorker(i)
      if (!task) {
        continue
      }

      slot.busy = true
      this.inFlight.set(task.requestId, {
        workerIndex: i,
        command: task.command,
        resolve: task.resolve as (value: unknown) => void,
        reject: task.reject,
        onProgress: task.onProgress,
        onMemoryDebug: task.onMemoryDebug,
      })

      try {
        slot.worker.postMessage(
          {
            id: task.requestId,
            command: task.command,
            payload: task.payload,
          },
          task.transferables,
        )

        if (task.timeoutMs > 0) {
          const inFlight = this.inFlight.get(task.requestId)
          if (inFlight) {
            inFlight.timeoutId = setTimeout(() => {
              const active = this.inFlight.get(task.requestId)
              if (!active) {
                return
              }
              this.inFlight.delete(task.requestId)
              active.reject(
                new Error(`Worker task timed out after ${task.timeoutMs}ms (${task.command}).`),
              )
              this.slots[i].busy = false
              this.resolveFinishWaitersIfIdle()
              this.replaceWorker(i)
              this.dispatch()
            }, task.timeoutMs)
          }
        }
      } catch (error) {
        this.inFlight.delete(task.requestId)
        slot.busy = false
        task.reject(error instanceof Error ? error : new Error(String(error)))
        this.resolveFinishWaitersIfIdle()
      }
    }
  }

  private takeNextTaskForWorker(workerIndex: number): TaskRecord | undefined {
    for (let queueIndex = 0; queueIndex < this.queue.length; queueIndex += 1) {
      const task = this.queue[queueIndex]
      if (!this.canRunTaskOnWorker(task, workerIndex)) {
        continue
      }

      this.queue.splice(queueIndex, 1)
      if (task.affinityKey && !this.affinitySlots.has(task.affinityKey)) {
        this.affinitySlots.set(task.affinityKey, workerIndex)
      }
      return task
    }
    return undefined
  }

  private canRunTaskOnWorker(task: TaskRecord, workerIndex: number): boolean {
    if (!task.affinityKey) {
      return true
    }
    const assignedWorker = this.affinitySlots.get(task.affinityKey)
    return assignedWorker === undefined || assignedWorker === workerIndex
  }

  private resolveFinishWaitersIfIdle(): void {
    if (!this.finishingCurrent || this.inFlight.size > 0) {
      return
    }
    const waiters = this.finishWaiters.splice(0)
    for (const resolve of waiters) {
      resolve()
    }
  }
}
