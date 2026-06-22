export type BrowserSupportSeverity = 'ok' | 'unsupported'

export interface BrowserSupportReason {
  code: string
  label: string
  detail: string
}

export interface BrowserSupportReport {
  supported: boolean
  severity: BrowserSupportSeverity
  summary: string
  reasons: BrowserSupportReason[]
  diagnosticLog: string[]
}

export interface BrowserSupportEnvironment {
  href: string
  secureContext: boolean
  crossOriginIsolated: boolean
  hasWorker: boolean
  hasWebAssembly: boolean
  hasCreateImageBitmap: boolean
  hasOffscreenCanvas: boolean
  userAgent: string
  platform: string
  maxTouchPoints: number
}

function readEnvironment(): BrowserSupportEnvironment {
  const nav = navigator
  return {
    href: window.location.href,
    secureContext: window.isSecureContext === true,
    crossOriginIsolated: window.crossOriginIsolated === true,
    hasWorker: typeof Worker === 'function',
    hasWebAssembly: typeof WebAssembly === 'object',
    hasCreateImageBitmap: typeof createImageBitmap === 'function',
    hasOffscreenCanvas: typeof OffscreenCanvas === 'function',
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
  }
}

function isIosWebKit(env: BrowserSupportEnvironment): boolean {
  const userAgent = env.userAgent.toLowerCase()
  const platform = env.platform.toLowerCase()
  const mobileIos = /iphone|ipad|ipod/.test(userAgent)
  const desktopModeIpad = platform === 'macintel' && env.maxTouchPoints > 1
  return mobileIos || desktopModeIpad
}

function bool(value: boolean): string {
  return value ? 'yes' : 'no'
}

export function inspectBrowserSupport(env: BrowserSupportEnvironment = readEnvironment()): BrowserSupportReport {
  const reasons: BrowserSupportReason[] = []
  const params = new URL(env.href).searchParams
  const simulatedNoIsolation = params.get('noiso') === '1'
  const crossOriginIsolated = env.crossOriginIsolated && !simulatedNoIsolation
  const iosWebKit = isIosWebKit(env)

  if (!env.secureContext) {
    reasons.push({
      code: 'insecure-context',
      label: 'Secure context is unavailable',
      detail: 'Browser-side ffmpeg/gifski workers must run from HTTPS, localhost, or another secure context.',
    })
  }

  if (!crossOriginIsolated) {
    reasons.push({
      code: simulatedNoIsolation ? 'simulated-no-isolation' : 'missing-cross-origin-isolation',
      label: simulatedNoIsolation ? 'Isolation failure is being simulated' : 'Cross-origin isolation is unavailable',
      detail:
        'WASM media workers require Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.',
    })
  }

  if (!env.hasWorker) {
    reasons.push({
      code: 'missing-worker',
      label: 'Web Workers are unavailable',
      detail: 'The converter runs ffmpeg.wasm and gifski.wasm in dedicated workers.',
    })
  }

  if (!env.hasWebAssembly) {
    reasons.push({
      code: 'missing-webassembly',
      label: 'WebAssembly is unavailable',
      detail: 'The media pipeline depends on ffmpeg.wasm and gifski.wasm.',
    })
  }

  if (!env.hasCreateImageBitmap) {
    reasons.push({
      code: 'missing-create-image-bitmap',
      label: 'createImageBitmap is unavailable',
      detail: 'Frame decoding uses createImageBitmap before passing RGBA frames to gifski.',
    })
  }

  if (!env.hasOffscreenCanvas) {
    reasons.push({
      code: 'missing-offscreen-canvas',
      label: 'OffscreenCanvas is unavailable',
      detail: 'Worker-side frame decoding requires OffscreenCanvas with a 2D context.',
    })
  }

  if (iosWebKit) {
    reasons.push({
      code: 'ios-webkit',
      label: 'iOS/iPadOS browser runtime detected',
      detail:
        'All iOS browsers use WebKit, which is not stable enough for this ffmpeg.wasm + gifski.wasm worker pipeline.',
    })
  }

  const supported = reasons.length === 0
  const summary = supported
    ? 'This browser has the required APIs for browser-side ffmpeg/gifski conversion.'
    : 'This browser is not supported for browser-side ffmpeg/gifski conversion.'
  const diagnosticLog = [
    `Browser support: ${supported ? 'supported' : 'unsupported'}`,
    `Secure context: ${bool(env.secureContext)}`,
    `Cross-origin isolated: ${bool(crossOriginIsolated)}`,
    `Web Worker: ${bool(env.hasWorker)}`,
    `WebAssembly: ${bool(env.hasWebAssembly)}`,
    `createImageBitmap: ${bool(env.hasCreateImageBitmap)}`,
    `OffscreenCanvas: ${bool(env.hasOffscreenCanvas)}`,
    `iOS/iPadOS WebKit detected: ${bool(iosWebKit)}`,
    `Platform: ${env.platform || 'unknown'}`,
    `User agent: ${env.userAgent || 'unknown'}`,
    ...reasons.map((reason) => `Reason [${reason.code}]: ${reason.label} - ${reason.detail}`),
  ]

  return {
    supported,
    severity: supported ? 'ok' : 'unsupported',
    summary,
    reasons,
    diagnosticLog,
  }
}
