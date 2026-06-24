import { describe, expect, it } from 'vitest'
import { inspectBrowserSupport, type BrowserSupportEnvironment } from './browserSupport'

function env(overrides: Partial<BrowserSupportEnvironment> = {}): BrowserSupportEnvironment {
  return {
    href: 'https://example.test/',
    secureContext: true,
    crossOriginIsolated: true,
    hasWorker: true,
    hasWebAssembly: true,
    hasCreateImageBitmap: true,
    hasOffscreenCanvas: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    platform: 'Win32',
    maxTouchPoints: 0,
    ...overrides,
  }
}

describe('browser support diagnostics', () => {
  it('allows a desktop browser with required APIs and isolation', () => {
    const report = inspectBrowserSupport(env())

    expect(report.supported).toBe(true)
    expect(report.reasons).toHaveLength(0)
    expect(report.diagnosticLog).toContain('Browser support: supported')
  })

  it('reports missing cross-origin isolation', () => {
    const report = inspectBrowserSupport(env({ crossOriginIsolated: false }))

    expect(report.supported).toBe(false)
    expect(report.reasons.map((reason) => reason.code)).toContain('missing-cross-origin-isolation')
  })

  it('supports no-isolation simulation from the query string', () => {
    const report = inspectBrowserSupport(env({ href: 'https://example.test/?noiso=1' }))

    expect(report.supported).toBe(false)
    expect(report.reasons.map((reason) => reason.code)).toContain('simulated-no-isolation')
    expect(report.diagnosticLog).toContain('Cross-origin isolated: no')
  })

  it('reports missing worker frame decode APIs', () => {
    const report = inspectBrowserSupport(env({ hasCreateImageBitmap: false, hasOffscreenCanvas: false }))

    expect(report.supported).toBe(false)
    expect(report.reasons.map((reason) => reason.code)).toEqual([
      'missing-create-image-bitmap',
      'missing-offscreen-canvas',
    ])
  })

  it('marks iOS WebKit as unsupported even when APIs appear present', () => {
    const report = inspectBrowserSupport(env({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    }))

    expect(report.supported).toBe(false)
    expect(report.reasons.map((reason) => reason.code)).toContain('ios-webkit')
  })

  it('detects iPadOS desktop-mode Safari as iOS WebKit', () => {
    const report = inspectBrowserSupport(env({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }))

    expect(report.supported).toBe(false)
    expect(report.reasons.map((reason) => reason.code)).toContain('ios-webkit')
  })

  it('marks Chrome on Android as unsupported', () => {
    const report = inspectBrowserSupport(env({
      userAgent:
        'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    }))

    expect(report.supported).toBe(false)
    expect(report.reasons.map((reason) => reason.code)).toContain('android-runtime')
    expect(report.diagnosticLog).toContain('Android runtime detected: yes')
  })

  it('marks Android WebView as unsupported', () => {
    const report = inspectBrowserSupport(env({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel Build/AP2A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/145.0.0.0 Mobile Safari/537.36 wv',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    }))

    expect(report.supported).toBe(false)
    expect(report.reasons.map((reason) => reason.code)).toContain('android-runtime')
  })
})
