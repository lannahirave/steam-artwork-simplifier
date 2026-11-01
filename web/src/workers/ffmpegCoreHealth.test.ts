import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FfmpegCoreUnavailableError,
  FfmpegCoreUnresponsiveError,
  createFfmpegCoreMonitor,
  isFfmpegCoreFailure,
  withCoreWatchdog,
} from './ffmpegCoreHealth'

describe('isFfmpegCoreFailure', () => {
  it('recognizes wasm traps forwarded as strings by @ffmpeg/ffmpeg', () => {
    expect(isFfmpegCoreFailure('RuntimeError: index out of bounds')).toBe(true)
    expect(isFfmpegCoreFailure('RuntimeError: memory access out of bounds')).toBe(true)
    expect(isFfmpegCoreFailure('RuntimeError: unreachable executed')).toBe(true)
    // Aborts surface this way only from calls other than exec (exec turns them into a return code).
    expect(isFfmpegCoreFailure('RuntimeError: Aborted(). Build with -sASSERTIONS for more info.')).toBe(true)
  })

  it('recognizes RuntimeError objects, @ffmpeg/ffmpeg sentinels and watchdog errors', () => {
    const trap = new Error('index out of bounds')
    trap.name = 'RuntimeError'
    expect(isFfmpegCoreFailure(trap)).toBe(true)
    expect(isFfmpegCoreFailure(new Error('ffmpeg is not loaded, call `await ffmpeg.load()` first'))).toBe(true)
    expect(isFfmpegCoreFailure(new Error('called FFmpeg.terminate()'))).toBe(true)
    expect(isFfmpegCoreFailure(new FfmpegCoreUnresponsiveError(30_000))).toBe(true)
    expect(isFfmpegCoreFailure(new FfmpegCoreUnavailableError())).toBe(true)
  })

  it('ignores ordinary failures, including wrapped messages that quote trap text', () => {
    expect(isFfmpegCoreFailure(new Error('ffmpeg failed to write the JPG image.'))).toBe(false)
    expect(isFfmpegCoreFailure('ErrnoError: FS error')).toBe(false)
    // Log tails can contain anything, e.g. a file title; only the raw rejection counts.
    expect(isFfmpegCoreFailure(new Error('ffmpeg probe failed.\n\nffmpeg output:\ntitle: index out of bounds'))).toBe(false)
    expect(isFfmpegCoreFailure(new Error('GIF encode failed via gifski.\n\nRuntimeError: unreachable'))).toBe(false)
    expect(isFfmpegCoreFailure('ffmpeg output: RuntimeError: unreachable')).toBe(false)
  })
})

describe('withCoreWatchdog', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes through results and errors that settle in time', async () => {
    await expect(withCoreWatchdog(Promise.resolve(7), 1000)).resolves.toBe(7)
    await expect(withCoreWatchdog(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
  })

  it('rejects with FfmpegCoreUnresponsiveError when the task never settles', async () => {
    vi.useFakeTimers()
    const pending = withCoreWatchdog(new Promise<number>(() => undefined), 30_000)
    const assertion = expect(pending).rejects.toBeInstanceOf(FfmpegCoreUnresponsiveError)
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
  })
})

/** Minimal stand-in for FFmpeg: methods are instance arrow functions, like the real class. */
function fakeFfmpeg() {
  const pending: Array<(reason: unknown) => void> = []
  const fake = {
    loaded: true,
    exec: vi.fn<(args: string[]) => Promise<number>>(),
    deleteFile: vi.fn<(path: string) => Promise<boolean>>(async () => true),
    load: vi.fn(async () => true),
    terminate: vi.fn(() => {
      // Like @ffmpeg/ffmpeg: pending calls are rejected when the core is terminated.
      pending.splice(0).forEach((reject) => reject(new Error('called FFmpeg.terminate()')))
    }),
    on: vi.fn(),
    hangNextExec() {
      fake.exec.mockImplementationOnce(() => new Promise<number>((_, reject) => pending.push(reject)))
    },
  }
  return fake
}

describe('createFfmpegCoreMonitor', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays healthy for ordinary results and non-core errors', async () => {
    const raw = fakeFfmpeg()
    raw.exec.mockResolvedValueOnce(1).mockRejectedValueOnce('ErrnoError: FS error')
    const monitor = createFfmpegCoreMonitor(raw as unknown as FFmpeg)

    await expect(monitor.ffmpeg.exec(['-i', 'a'])).resolves.toBe(1)
    await expect(monitor.ffmpeg.exec(['-i', 'a'])).rejects.toBe('ErrnoError: FS error')
    expect(monitor.failed).toBe(false)
  })

  it('flags a trap and fails later calls immediately until reset', async () => {
    const raw = fakeFfmpeg()
    raw.exec.mockRejectedValueOnce('RuntimeError: index out of bounds').mockResolvedValue(0)
    const monitor = createFfmpegCoreMonitor(raw as unknown as FFmpeg)

    await expect(monitor.ffmpeg.exec(['-i', 'a'])).rejects.toBe('RuntimeError: index out of bounds')
    expect(monitor.failed).toBe(true)

    // Cleanup must not reach the broken core.
    await expect(monitor.ffmpeg.deleteFile('a')).rejects.toBeInstanceOf(FfmpegCoreUnavailableError)
    expect(raw.deleteFile).not.toHaveBeenCalled()
    // Lifecycle methods still pass through.
    monitor.ffmpeg.on('log', () => undefined)
    expect(raw.on).toHaveBeenCalledTimes(1)

    monitor.reset()
    expect(raw.terminate).toHaveBeenCalledTimes(1)
    expect(monitor.failed).toBe(false)
    await expect(monitor.ffmpeg.exec(['-i', 'a'])).resolves.toBe(0)
  })

  it('calls methods on the real instance so #private fields keep working', async () => {
    class PrivateStateFfmpeg {
      #listeners = 0
      #runs = 0
      on(): void {
        this.#listeners += 1
      }
      async exec(): Promise<number> {
        this.#runs += 1
        return this.#runs
      }
      terminate(): void {
        this.#runs = 0
      }
      get listeners(): number {
        return this.#listeners
      }
    }
    const raw = new PrivateStateFfmpeg()
    const monitor = createFfmpegCoreMonitor(raw as unknown as FFmpeg)

    monitor.ffmpeg.on('log', () => undefined)
    await expect(monitor.ffmpeg.exec([])).resolves.toBe(1)
    expect(raw.listeners).toBe(1)
    monitor.reset()
    await expect(monitor.ffmpeg.exec([])).resolves.toBe(1)
  })

  it('flags a wedged call via watch() and ignores its late rejection after reset', async () => {
    vi.useFakeTimers()
    const raw = fakeFfmpeg()
    raw.hangNextExec()
    const monitor = createFfmpegCoreMonitor(raw as unknown as FFmpeg)

    const watched = monitor.watch(monitor.ffmpeg.exec(['-i', 'a']), 1000)
    const assertion = expect(watched).rejects.toBeInstanceOf(FfmpegCoreUnresponsiveError)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    expect(monitor.failed).toBe(true)

    // terminate() rejects the abandoned exec with "called FFmpeg.terminate()"; that stale
    // rejection must not flag the fresh core as failed again.
    monitor.reset()
    await vi.advanceTimersByTimeAsync(0)
    expect(monitor.failed).toBe(false)
  })
})
