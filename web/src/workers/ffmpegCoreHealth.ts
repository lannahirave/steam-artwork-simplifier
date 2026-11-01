import type { FFmpeg } from '@ffmpeg/ffmpeg'

// Tracks whether the ffmpeg.wasm core is still usable. After a WebAssembly trap
// ("index out of bounds", "unreachable") the core's memory is in an undefined state:
// later commands on the same instance throw, hang, or silently produce garbage.
// The worker must terminate and reload the core before running anything else.
//
// Limitation: @ffmpeg/core's exec() catches Emscripten abort() itself and returns a
// non-zero code (it also logs "Aborted()" after every normal run), so an abort inside
// exec is not visible here. A core left broken by such an abort is caught when its next
// call traps.

/** Thrown when an ffmpeg call did not settle in time and the core is presumed wedged. */
export class FfmpegCoreUnresponsiveError extends Error {
  constructor(timeoutMs: number) {
    super(`ffmpeg did not respond within ${Math.round(timeoutMs / 1000)}s.`)
    this.name = 'FfmpegCoreUnresponsiveError'
  }
}

/** Thrown for calls made after the core failed, so cleanup never waits on a dead core. */
export class FfmpegCoreUnavailableError extends Error {
  constructor() {
    super('ffmpeg core is unavailable after a crash.')
    this.name = 'FfmpegCoreUnavailableError'
  }
}

// Sentinel messages from @ffmpeg/ffmpeg's errors.js.
const FFMPEG_NOT_LOADED_MESSAGE = 'ffmpeg is not loaded, call `await ffmpeg.load()` first'
const FFMPEG_TERMINATED_MESSAGE = 'called FFmpeg.terminate()'

/**
 * True when a raw rejection from an FFmpeg method means the core is broken.
 * @ffmpeg/ffmpeg forwards core exceptions as `e.toString()` strings, so a wasm trap
 * arrives as e.g. "RuntimeError: index out of bounds". Only the raw rejection is checked,
 * never a wrapped message that may embed ffmpeg log output.
 */
export function isFfmpegCoreFailure(error: unknown): boolean {
  if (error instanceof FfmpegCoreUnresponsiveError || error instanceof FfmpegCoreUnavailableError) {
    return true
  }
  if (error instanceof Error) {
    return (
      error.name === 'RuntimeError' ||
      error.message === FFMPEG_NOT_LOADED_MESSAGE ||
      error.message === FFMPEG_TERMINATED_MESSAGE
    )
  }
  return typeof error === 'string' && /^RuntimeError\b/.test(error)
}

/** Rejects with FfmpegCoreUnresponsiveError if `task` has not settled after `timeoutMs`. */
export function withCoreWatchdog<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new FfmpegCoreUnresponsiveError(timeoutMs)), timeoutMs)
    task.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export type CoreWatch = <T>(task: Promise<T>, timeoutMs: number) => Promise<T>

export interface FfmpegCoreMonitor {
  /** Use this everywhere instead of the raw instance; it records core failures. */
  readonly ffmpeg: FFmpeg
  /** True once a call trapped, hung past its deadline, or hit an unloaded core. */
  readonly failed: boolean
  /** Like withCoreWatchdog, but a timeout also marks the core as failed. */
  readonly watch: CoreWatch
  /** Terminates the core so the next load() starts a fresh one, and clears the failure. */
  reset(): void
}

// Methods that manage the core's lifecycle bypass the failure gate.
const LIFECYCLE_METHODS = new Set<PropertyKey>(['load', 'terminate', 'on', 'off'])

export function createFfmpegCoreMonitor(raw: FFmpeg): FfmpegCoreMonitor {
  let failed = false
  // Calls abandoned by reset() reject later (terminate() rejects them asynchronously from the
  // caller's point of view); the generation check keeps them from failing the fresh core.
  let generation = 0
  const markFailed = (callGeneration: number): void => {
    if (callGeneration === generation) {
      failed = true
    }
  }

  const observe = <T>(task: Promise<T>): Promise<T> => {
    const callGeneration = generation
    return task.catch((error: unknown) => {
      if (isFfmpegCoreFailure(error)) {
        markFailed(callGeneration)
      }
      throw error
    })
  }

  const watch: CoreWatch = (task, timeoutMs) => {
    const callGeneration = generation
    return withCoreWatchdog(task, timeoutMs).catch((error: unknown) => {
      if (error instanceof FfmpegCoreUnresponsiveError) {
        markFailed(callGeneration)
      }
      throw error
    })
  }

  const ffmpeg = new Proxy(raw, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') {
        return value
      }
      // FFmpeg keeps state in #private fields, which only resolve when `this` is the real
      // instance, never the proxy. Always call through to the target.
      if (LIFECYCLE_METHODS.has(property)) {
        return value.bind(target)
      }
      return (...args: unknown[]) => {
        if (failed) {
          return Promise.reject(new FfmpegCoreUnavailableError())
        }
        const result: unknown = value.apply(target, args)
        return result instanceof Promise ? observe(result) : result
      }
    },
  })

  return {
    ffmpeg,
    get failed() {
      return failed
    },
    watch,
    reset() {
      try {
        raw.terminate()
      } catch {
        // terminate() only rejects pending calls and stops the core worker.
      }
      generation += 1
      failed = false
    },
  }
}
