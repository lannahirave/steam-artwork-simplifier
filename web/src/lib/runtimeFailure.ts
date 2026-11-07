import type { WorkerFailureReason } from './types'

/** A runtime the conversion workers need (currently gifski) failed to load. */
export interface RuntimeFailure {
  reason: WorkerFailureReason
  message: string
}

let current: RuntimeFailure | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

/** Reports a failure; while one is already showing, later ones (other workers) are ignored. */
export function reportRuntimeFailure(failure: RuntimeFailure): void {
  if (current) {
    return
  }
  current = failure
  notify()
}

/** Hides the prompt; the next failure shows it again. */
export function dismissRuntimeFailure(): void {
  current = null
  notify()
}

export function getRuntimeFailure(): RuntimeFailure | null {
  return current
}

export function subscribeRuntimeFailure(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
