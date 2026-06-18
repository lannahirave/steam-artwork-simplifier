import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(webRoot, '..')
const onboardingStorageKey = 'steam-artwork-studio:onboarding-complete'
const memoryEventHistoryLimit = 400
const progressHistoryLimit = 200

const scenarios = {
  smoke: {
    description: 'Fast mechanics check with a small repo fixture.',
    file: '../media/test-fixtures/fixture04_small_320x240_12fps_6s.mp4',
    timeoutMs: 240_000,
    settings: {
      preset: 'workshop',
      parts: 5,
      partWidth: 150,
      rows: 1,
      workers: 3,
      gifFps: 12,
      minGifFps: 10,
      maxGifKb: 5000,
      targetGifKb: 4500,
      optimizationMode: 'hybrid',
      disableOptimizations: false,
      standardRetriesEnabled: true,
      retryAllowFpsDrop: true,
      retryAllowQualityDrop: true,
    },
  },
  stress: {
    description: 'Workshop memory stress run with 3 rows and 3 workers.',
    file: '../media/iamananimal.mp4',
    timeoutMs: 900_000,
    settings: {
      preset: 'workshop',
      parts: 5,
      partWidth: 150,
      rows: 3,
      workers: 3,
      gifFps: 15,
      minGifFps: 10,
      maxGifKb: 5000,
      targetGifKb: 4500,
      optimizationMode: 'hybrid',
      disableOptimizations: false,
      standardRetriesEnabled: true,
      retryAllowFpsDrop: true,
      retryAllowQualityDrop: true,
    },
  },
}

function usage() {
  return `Usage: npm run bench:memory -- [options]

Options:
  --scenario smoke|stress       Scenario to run. Default: smoke
  --runs N                      Number of serial runs. Default: 1
  --file PATH                   Override input file path, relative to web/
  --port N                      Preferred Vite dev server port. Default: 5173
  --timeout-ms N                Per-run timeout. Scenario default when omitted
  --headed                      Run Chromium headed
  --summary-only                Omit raw Memory Debug JSON from stdout report
  --out PATH                    Also write the machine-readable report to PATH
  --peak-threshold-mb N         Exit non-zero if any run exceeds this browser peak
  --rows N                      Override Workshop row count
  --workers N                   Override worker count
  --parts N                     Override Workshop parts
  --part-width N                Override Workshop part width
  --gif-fps N                   Override GIF FPS
  --min-gif-fps N               Override Min GIF FPS
  --max-gif-kb N                Override Max GIF KB
  --target-gif-kb N             Override Target GIF KB
  --optimization-mode VALUE     hybrid, quality-first, or fast-fit
  --disable-optimizations       Enable raw encode mode
  --no-standard-retries         Disable standard retries
  --no-fps-reduction            Disable FPS reduction
  --no-quality-reduction        Disable quality reduction
`
}

function parseInteger(value, label) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return parsed
}

function readOptionValue(argv, index, name) {
  const arg = argv[index]
  const inline = arg.indexOf('=')
  if (inline !== -1) {
    return { value: arg.slice(inline + 1), nextIndex: index }
  }
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for --${name}`)
  }
  return { value, nextIndex: index + 1 }
}

function parseArgs(argv) {
  const out = {
    scenario: 'smoke',
    runs: 1,
    port: 5173,
    headed: false,
    summaryOnly: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      out.help = true
      continue
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const rawName = arg.slice(2).split('=')[0]
    if (rawName === 'headed') {
      out.headed = true
      continue
    }
    if (rawName === 'summary-only') {
      out.summaryOnly = true
      continue
    }
    if (rawName === 'disable-optimizations') {
      out.disableOptimizations = true
      continue
    }
    if (rawName === 'no-standard-retries') {
      out.standardRetriesEnabled = false
      continue
    }
    if (rawName === 'no-fps-reduction') {
      out.retryAllowFpsDrop = false
      continue
    }
    if (rawName === 'no-quality-reduction') {
      out.retryAllowQualityDrop = false
      continue
    }

    const { value, nextIndex } = readOptionValue(argv, index, rawName)
    index = nextIndex

    switch (rawName) {
      case 'scenario':
        out.scenario = value
        break
      case 'runs':
        out.runs = Math.max(1, parseInteger(value, rawName))
        break
      case 'file':
        out.file = value
        break
      case 'port':
        out.port = parseInteger(value, rawName)
        break
      case 'timeout-ms':
        out.timeoutMs = Math.max(30_000, parseInteger(value, rawName))
        break
      case 'out':
        out.out = value
        break
      case 'peak-threshold-mb':
        out.peakThresholdMb = Number.parseFloat(value)
        if (!Number.isFinite(out.peakThresholdMb) || out.peakThresholdMb <= 0) {
          throw new Error(`Invalid --peak-threshold-mb: ${value}`)
        }
        break
      case 'rows':
        out.rows = parseInteger(value, rawName)
        break
      case 'workers':
        out.workers = parseInteger(value, rawName)
        break
      case 'parts':
        out.parts = parseInteger(value, rawName)
        break
      case 'part-width':
        out.partWidth = parseInteger(value, rawName)
        break
      case 'gif-fps':
        out.gifFps = parseInteger(value, rawName)
        break
      case 'min-gif-fps':
        out.minGifFps = parseInteger(value, rawName)
        break
      case 'max-gif-kb':
        out.maxGifKb = parseInteger(value, rawName)
        break
      case 'target-gif-kb':
        out.targetGifKb = parseInteger(value, rawName)
        break
      case 'optimization-mode':
        out.optimizationMode = value
        break
      default:
        throw new Error(`Unknown option: --${rawName}`)
    }
  }

  return out
}

function resolveInputFile(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(webRoot, filePath)
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function getGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function parseElapsedToSeconds(value) {
  const parts = value.split(':').map((part) => Number.parseInt(part, 10))
  if (parts.some((part) => Number.isNaN(part))) {
    return null
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts
    return minutes * 60 + seconds
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts
    return hours * 3600 + minutes * 60 + seconds
  }
  return null
}

function parseCompletion(bodyText) {
  const failed = bodyText.match(/Failed:\s*([^\n]+)/)
  if (failed) {
    return {
      status: 'failed',
      message: failed[1],
      elapsedSeconds: null,
    }
  }

  const match =
    bodyText.match(/Conversion complete in\s+([0-9:]+)\./) ??
    bodyText.match(/Output ready in\s+([0-9:]+)\./)
  if (!match) {
    return {
      status: 'unknown',
      message: 'Could not find completion text.',
      elapsedSeconds: null,
    }
  }

  return {
    status: 'completed',
    message: match[0],
    elapsedSeconds: parseElapsedToSeconds(match[1]),
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function labelLocator(page, label) {
  return page
    .locator('label')
    .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}`) })
    .first()
}

async function setNumberField(page, label, value) {
  await labelLocator(page, label).locator('input').first().fill(String(value))
}

async function setSelectField(page, label, value) {
  await labelLocator(page, label).locator('select').first().selectOption(String(value))
}

async function setCheckboxField(page, label, checked) {
  const checkbox = labelLocator(page, label).locator('input[type="checkbox"]').first()
  if ((await checkbox.count()) === 0) {
    return
  }
  await checkbox.setChecked(checked)
}

async function setRawMode(page, disabled) {
  if (disabled) {
    const disableButton = page.getByRole('button', { name: 'Disable Optimizations' }).first()
    if ((await disableButton.count()) > 0 && await disableButton.isVisible()) {
      await disableButton.click()
    }
    return
  }

  const enableButton = page.getByRole('button', { name: 'Enable Optimizations' }).first()
  if ((await enableButton.count()) > 0 && await enableButton.isVisible()) {
    await enableButton.click()
  }
}

async function applySettings(page, settings) {
  await setSelectField(page, 'Preset', settings.preset)
  await setNumberField(page, 'Parts', settings.parts)
  await setNumberField(page, 'Part Width', settings.partWidth)
  await setSelectField(page, 'Rows', settings.rows)
  await setNumberField(page, 'GIF FPS', settings.gifFps)
  await setNumberField(page, 'Min GIF FPS', settings.minGifFps)
  await setNumberField(page, 'Max GIF KB', settings.maxGifKb)
  await setNumberField(page, 'Target GIF KB', settings.targetGifKb)
  await setRawMode(page, settings.disableOptimizations)
  await setSelectField(page, 'Optimization Mode', settings.optimizationMode)
  await setCheckboxField(page, 'Enable standard retries', settings.standardRetriesEnabled)
  await setCheckboxField(page, 'Allow FPS reduction', settings.retryAllowFpsDrop)
  await setCheckboxField(page, 'Allow quality reduction', settings.retryAllowQualityDrop)
  await setNumberField(page, 'Worker Count', settings.workers)
}

async function installClipboardCapture(page) {
  await page.evaluate(() => {
    window.__memoryBenchmarkClipboard = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__memoryBenchmarkClipboard = String(text)
        },
      },
    })
  })
}

async function copyMemoryDebugJson(page) {
  await page.locator('details.memory-debug-panel').evaluate((details) => {
    details.open = true
  })
  await page.getByRole('button', { name: 'Copy JSON' }).click()
  const jsonText = await page.evaluate(() => window.__memoryBenchmarkClipboard)
  if (!jsonText) {
    throw new Error('Memory Debug copy produced no JSON.')
  }
  return JSON.parse(jsonText)
}

function summarizeBuckets(events) {
  const rows = new Map()
  const retainedByKey = new Map()

  for (const event of events) {
    const row = rows.get(event.bucket) ?? {
      bucket: event.bucket,
      count: 0,
      observedBytes: 0,
      retainedBytes: 0,
      peakBytes: 0,
    }
    row.count += 1
    row.observedBytes += event.bytes ?? 0
    row.peakBytes = Math.max(row.peakBytes, event.bytes ?? 0)
    rows.set(event.bucket, row)

    if (event.kind === 'retained' && event.retainedKey) {
      retainedByKey.set(`${event.source}:${event.workerIndex ?? 'main'}:${event.retainedKey}`, {
        bucket: event.bucket,
        bytes: event.bytes ?? 0,
      })
    }
  }

  for (const retained of retainedByKey.values()) {
    const row = rows.get(retained.bucket)
    if (row) {
      row.retainedBytes += retained.bytes
    }
  }

  return Object.fromEntries(
    Array.from(rows.values())
      .sort((left, right) => right.retainedBytes - left.retainedBytes || right.observedBytes - left.observedBytes)
      .map((row) => [row.bucket, row]),
  )
}

function summarizeWorkers(events) {
  const rows = new Map()
  const retainedByKey = new Map()

  for (const event of events) {
    if (event.workerIndex === undefined) {
      continue
    }
    const row = rows.get(event.workerIndex) ?? {
      workerIndex: event.workerIndex,
      count: 0,
      observedBytes: 0,
      retainedBytes: 0,
      decodedRgbaEvents: 0,
      gifskiFrameInputEvents: 0,
    }
    row.count += 1
    row.observedBytes += event.bytes ?? 0
    if (event.bucket === 'decoded-rgba') {
      row.decodedRgbaEvents += 1
    }
    if (event.bucket === 'gifski-frame-input') {
      row.gifskiFrameInputEvents += 1
    }
    rows.set(event.workerIndex, row)

    if (event.kind === 'retained' && event.retainedKey) {
      retainedByKey.set(`${event.workerIndex}:${event.retainedKey}`, {
        workerIndex: event.workerIndex,
        bytes: event.bytes ?? 0,
      })
    }
  }

  for (const retained of retainedByKey.values()) {
    const row = rows.get(retained.workerIndex)
    if (row) {
      row.retainedBytes += retained.bytes
    }
  }

  return Array.from(rows.values()).sort((left, right) => left.workerIndex - right.workerIndex)
}

function peakSample(samples) {
  return samples.reduce((peak, sample) => {
    if (!peak || (sample.bytes ?? 0) > (peak.bytes ?? 0)) {
      return sample
    }
    return peak
  }, null)
}

function summarizeMemoryDebug(memoryDebug, progressText) {
  const events = memoryDebug.events ?? []
  const samples = memoryDebug.samples ?? []
  const latest = samples[samples.length - 1] ?? null
  const peak = peakSample(samples)
  const progressLines = progressText ? progressText.split(/\r?\n/).filter(Boolean) : []
  const cacheReuseProgressLines = progressLines.filter((line) =>
    line.includes('Reusing decoded frame sequence'),
  )

  return {
    browserMemory: {
      currentBytes: latest?.bytes ?? 0,
      currentSource: latest?.source ?? 'none',
      peakBytes: peak?.bytes ?? 0,
      peakSource: peak?.source ?? 'none',
      sampleCount: samples.length,
      latestNote: latest?.note,
    },
    buckets: summarizeBuckets(events),
    workers: summarizeWorkers(events),
    recoveryCost: {
      decodedRgbaEvents: events.filter((event) => event.bucket === 'decoded-rgba').length,
      gifskiFrameInputEvents: events.filter((event) => event.bucket === 'gifski-frame-input').length,
      frameCacheRetainedEvents: events.filter((event) => event.bucket === 'frame-cache-retained').length,
      cacheReuseProgressLines: cacheReuseProgressLines.length,
    },
    history: {
      memoryEvents: events.length,
      memoryEventHistoryMayBeTruncated: events.length >= memoryEventHistoryLimit,
      progressLines: progressLines.length,
      progressHistoryMayBeTruncated: progressLines.length >= progressHistoryLimit,
    },
  }
}

function aggregateNumbers(values) {
  const clean = values.filter((value) => Number.isFinite(value))
  if (clean.length === 0) {
    return { min: null, avg: null, max: null }
  }
  const sum = clean.reduce((acc, value) => acc + value, 0)
  return {
    min: Math.min(...clean),
    avg: Number((sum / clean.length).toFixed(2)),
    max: Math.max(...clean),
  }
}

function bytesToMb(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(1))
}

function buildSettings(options) {
  const scenario = scenarios[options.scenario]
  if (!scenario) {
    throw new Error(`Unknown scenario "${options.scenario}". Use smoke or stress.`)
  }

  return {
    ...scenario.settings,
    ...(options.rows !== undefined ? { rows: options.rows } : {}),
    ...(options.workers !== undefined ? { workers: options.workers } : {}),
    ...(options.parts !== undefined ? { parts: options.parts } : {}),
    ...(options.partWidth !== undefined ? { partWidth: options.partWidth } : {}),
    ...(options.gifFps !== undefined ? { gifFps: options.gifFps } : {}),
    ...(options.minGifFps !== undefined ? { minGifFps: options.minGifFps } : {}),
    ...(options.maxGifKb !== undefined ? { maxGifKb: options.maxGifKb } : {}),
    ...(options.targetGifKb !== undefined ? { targetGifKb: options.targetGifKb } : {}),
    ...(options.optimizationMode !== undefined ? { optimizationMode: options.optimizationMode } : {}),
    ...(options.disableOptimizations !== undefined ? { disableOptimizations: options.disableOptimizations } : {}),
    ...(options.standardRetriesEnabled !== undefined ? { standardRetriesEnabled: options.standardRetriesEnabled } : {}),
    ...(options.retryAllowFpsDrop !== undefined ? { retryAllowFpsDrop: options.retryAllowFpsDrop } : {}),
    ...(options.retryAllowQualityDrop !== undefined ? { retryAllowQualityDrop: options.retryAllowQualityDrop } : {}),
  }
}

async function runSingleBenchmark({
  browser,
  filePath,
  runIndex,
  settings,
  timeoutMs,
  url,
}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  })
  await context.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, 'true')
  }, onboardingStorageKey)
  const page = await context.newPage()
  const startedAt = Date.now()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[type="file"]', { timeout: 30_000 })
    await installClipboardCapture(page)
    await applySettings(page, settings)
    await page.locator('input[type="file"]').setInputFiles(filePath)
    await page.getByRole('button', { name: 'Run Conversion' }).click()

    await page.waitForFunction(
      () => {
        const text = document.body.innerText
        return (
          text.includes('Conversion complete in ') ||
          text.includes('Output ready in ') ||
          text.includes('Failed:')
        )
      },
      undefined,
      { timeout: timeoutMs },
    )
    await page.waitForTimeout(1000)

    const bodyText = await page.locator('body').innerText()
    const progressText =
      (await page.locator('.log-box pre').count()) > 0
        ? await page.locator('.log-box pre').innerText()
        : ''
    const completion = parseCompletion(bodyText)
    const memoryDebug = await copyMemoryDebugJson(page)
    const wallClockSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2))
    const metrics = summarizeMemoryDebug(memoryDebug, progressText)

    return {
      run: runIndex + 1,
      status: completion.status,
      message: completion.message,
      elapsedSeconds: completion.elapsedSeconds,
      wallClockSeconds,
      metrics,
      memoryDebug,
    }
  } finally {
    await context.close()
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const scenario = scenarios[options.scenario]
  if (!scenario) {
    throw new Error(`Unknown scenario "${options.scenario}". Use smoke or stress.`)
  }
  const settings = buildSettings(options)
  const inputFile = resolveInputFile(options.file ?? scenario.file)
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`)
  }
  const fileStat = fs.statSync(inputFile)
  const timeoutMs = options.timeoutMs ?? scenario.timeoutMs
  const thresholdBytes =
    options.peakThresholdMb === undefined
      ? null
      : Math.round(options.peakThresholdMb * 1024 * 1024)

  const server = await createServer({
    configFile: path.resolve(webRoot, 'vite.config.ts'),
    root: webRoot,
    server: {
      host: '127.0.0.1',
      port: options.port,
      strictPort: false,
    },
    logLevel: 'error',
  })
  await server.listen()
  const url = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${options.port}/`

  const browser = await chromium.launch({
    headless: !options.headed,
    args: ['--enable-precise-memory-info'],
  })

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    gitCommit: getGitCommit(),
    scenario: options.scenario,
    scenarioDescription: scenario.description,
    url,
    runsRequested: options.runs,
    timeoutMs,
    settings,
    fixture: {
      path: inputFile,
      sizeBytes: fileStat.size,
      sha256: sha256File(inputFile),
    },
    environment: {
      node: process.version,
      platform: process.platform,
      browser: browser.version(),
    },
    threshold: thresholdBytes
      ? {
          peakBrowserBytes: thresholdBytes,
          peakBrowserMb: options.peakThresholdMb,
        }
      : null,
    runs: [],
  }

  try {
    for (let runIndex = 0; runIndex < options.runs; runIndex += 1) {
      console.error(
        `[bench:memory] run ${runIndex + 1}/${options.runs}: scenario=${options.scenario}, file=${path.basename(inputFile)}`,
      )
      const run = await runSingleBenchmark({
        browser,
        filePath: inputFile,
        runIndex,
        settings,
        timeoutMs,
        url,
      })
      const rawMemoryDebug = run.memoryDebug
      if (options.summaryOnly) {
        delete run.memoryDebug
      }
      report.runs.push(run)

      const peakMb = bytesToMb(run.metrics.browserMemory.peakBytes)
      const retainedFrameCache = run.metrics.buckets['frame-cache-retained']?.retainedBytes ?? 0
      console.error(
        [
          `[bench:memory] run ${run.run} ${run.status}`,
          `elapsed=${run.elapsedSeconds ?? run.wallClockSeconds}s`,
          `peak=${peakMb}MB via ${run.metrics.browserMemory.peakSource}`,
          `frame-cache-retained=${bytesToMb(retainedFrameCache)}MB`,
          `decoded-rgba-events=${run.metrics.recoveryCost.decodedRgbaEvents}`,
          `gifski-input-events=${run.metrics.recoveryCost.gifskiFrameInputEvents}`,
          `cache-reuse-lines=${run.metrics.recoveryCost.cacheReuseProgressLines}`,
        ].join(', '),
      )

      if (run.metrics.history.memoryEventHistoryMayBeTruncated) {
        console.error(
          `[bench:memory] run ${run.run} warning: Memory Debug event history reached ${memoryEventHistoryLimit}; event counts are lower bounds.`,
        )
      }
      if (rawMemoryDebug.samples?.length === 0) {
        console.error(`[bench:memory] run ${run.run} warning: no browser memory samples were captured.`)
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }

  const elapsedValues = report.runs.map((run) => run.elapsedSeconds ?? run.wallClockSeconds)
  const peakValues = report.runs.map((run) => run.metrics.browserMemory.peakBytes)
  report.aggregate = {
    elapsedSeconds: aggregateNumbers(elapsedValues),
    peakBrowserBytes: aggregateNumbers(peakValues),
    peakBrowserMb: aggregateNumbers(peakValues.map(bytesToMb)),
  }

  const thresholdFailures = thresholdBytes
    ? report.runs.filter((run) => run.metrics.browserMemory.peakBytes > thresholdBytes)
    : []
  report.thresholdFailures = thresholdFailures.map((run) => ({
    run: run.run,
    peakBrowserBytes: run.metrics.browserMemory.peakBytes,
    peakBrowserMb: bytesToMb(run.metrics.browserMemory.peakBytes),
  }))

  const json = `${JSON.stringify(report, null, 2)}\n`
  if (options.out) {
    const outputPath = path.isAbsolute(options.out) ? options.out : path.resolve(webRoot, options.out)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, json)
    console.error(`[bench:memory] wrote report: ${outputPath}`)
  }
  process.stdout.write(json)

  if (thresholdFailures.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  console.error(`[bench:memory] ${message}`)
  process.exitCode = 1
})
