import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'

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

async function waitForCompletion(page, timeoutMs) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText
      return text.includes('Output ready in ') || text.includes('Conversion complete in ')
    },
    undefined,
    { timeout: timeoutMs },
  )

  const bodyText = await page.locator('body').innerText()
  const matches = [...bodyText.matchAll(/Output ready in\s+([0-9:]+)\./g)]
  if (matches.length === 0) {
    throw new Error('Could not find "Output ready in" in page text after completion.')
  }
  const latest = matches[matches.length - 1][1]
  const seconds = parseElapsedToSeconds(latest)
  if (seconds === null) {
    throw new Error(`Could not parse elapsed time "${latest}".`)
  }
  return { display: latest, seconds }
}

async function run() {
  const targetFile = process.argv[2] ?? '../media/re6.mp4'
  const runs = Math.max(1, Number.parseInt(process.argv[3] ?? '1', 10) || 1)
  const url = process.argv[4] ?? 'http://localhost:5173/'
  const timeoutMs = Math.max(60_000, Number.parseInt(process.argv[5] ?? '600000', 10) || 600_000)
  const resolvedFile = path.resolve(process.cwd(), targetFile)

  if (!fs.existsSync(resolvedFile)) {
    throw new Error(`Input file not found: ${resolvedFile}`)
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  const samples = []

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[type="file"]', { timeout: 30_000 })

    for (let i = 0; i < runs; i += 1) {
      const runLabel = `run-${i + 1}`
      const resetButton = page.getByRole('button', { name: 'Reset Results' })
      if (i > 0 && (await resetButton.isEnabled())) {
        await resetButton.click()
      }

      await page.locator('input[type="file"]').setInputFiles(resolvedFile)
      const runButton = page.getByRole('button', { name: 'Run Conversion' })
      await runButton.click()

      const elapsed = await waitForCompletion(page, timeoutMs)
      samples.push(elapsed.seconds)
      console.log(`${runLabel}: ${elapsed.display} (${elapsed.seconds}s)`)
    }
  } finally {
    await context.close()
    await browser.close()
  }

  const min = Math.min(...samples)
  const max = Math.max(...samples)
  const avg = samples.reduce((acc, value) => acc + value, 0) / samples.length
  const summary = {
    file: resolvedFile,
    runs,
    samplesSeconds: samples,
    minSeconds: min,
    maxSeconds: max,
    avgSeconds: Number(avg.toFixed(2)),
  }
  console.log(JSON.stringify(summary, null, 2))
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[benchmark] ${message}`)
  process.exitCode = 1
})
