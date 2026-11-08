export type FeedbackOutcome =
  | 'worked'
  | 'problem'
  | 'problem-rejected'
  | 'problem-looks-wrong'
  | 'problem-quality'
  | 'problem-other'

// Fire-and-forget aggregate counter for the feedback popup. Only the fixed outcome
// name is sent, and failures are swallowed.
export function trackFeedback(outcome: FeedbackOutcome): void {
  if (import.meta.env.DEV || typeof navigator.sendBeacon !== 'function') {
    return
  }
  try {
    navigator.sendBeacon(`/api/feedback?outcome=${outcome}`)
  } catch {
    // Best-effort only.
  }
}
