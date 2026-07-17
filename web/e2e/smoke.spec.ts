import { expect, test, type Page } from '@playwright/test'

const ONBOARDING_STORAGE_KEY = 'steam-artwork-studio:onboarding-complete'
const CHROME_DESKTOP_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
]
const CHROME_MOBILE_USER_AGENTS = [
  {
    name: 'iPhone',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0.7871.34 Mobile/15E148 Safari/604.1',
    reason: 'Reason [ios-webkit]',
    label: 'iOS/iPadOS browser runtime detected',
  },
  {
    name: 'iPad',
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0.7871.34 Mobile/15E148 Safari/604.1',
    reason: 'Reason [ios-webkit]',
    label: 'iOS/iPadOS browser runtime detected',
  },
  {
    name: 'iPod',
    userAgent:
      'Mozilla/5.0 (iPod; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0.7871.34 Mobile/15E148 Safari/604.1',
    reason: 'Reason [ios-webkit]',
    label: 'iOS/iPadOS browser runtime detected',
  },
  {
    name: 'Android',
    userAgent:
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.160 Mobile Safari/537.36',
    reason: 'Reason [android-runtime]',
    label: 'Android browser runtime detected',
  },
]

async function markOnboardingComplete(page: Page): Promise<void> {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, 'true')
  }, ONBOARDING_STORAGE_KEY)
}

async function expectSpotlightFitsPanel(page: Page, targetName: string): Promise<void> {
  await expect(page.locator(`[data-onboarding-target="${targetName}"]`)).toBeInViewport()
  await expect(page.locator('.onboarding-spotlight')).toHaveCSS('opacity', '1')

  await expect.poll(async () => {
    const metrics = await page.evaluate((name) => {
      const target = document.querySelector(`[data-onboarding-target="${name}"]`)
      const spotlight = document.querySelector('.onboarding-spotlight')
      if (!target || !spotlight) {
        return null
      }

      const targetRect = target.getBoundingClientRect()
      const spotlightRect = spotlight.getBoundingClientRect()
      const visibleTargetTop = Math.max(56, targetRect.top - 10)
      const visibleTargetBottom = Math.min(window.innerHeight - 16, targetRect.bottom + 10)
      return {
        topDelta: Math.abs(spotlightRect.top - visibleTargetTop),
        bottomDelta: Math.abs(spotlightRect.bottom - visibleTargetBottom),
        spotlightHeight: spotlightRect.height,
      }
    }, targetName)

    if (!metrics) {
      return false
    }
    return metrics.topDelta <= 1 && metrics.bottomDelta <= 1 && metrics.spotlightHeight >= 96
  }).toBe(true)

  const metrics = await page.evaluate((name) => {
    const target = document.querySelector(`[data-onboarding-target="${name}"]`)
    const spotlight = document.querySelector('.onboarding-spotlight')
    if (!target || !spotlight) {
      return null
    }

    const targetRect = target.getBoundingClientRect()
    const spotlightRect = spotlight.getBoundingClientRect()
    return {
      targetHeight: targetRect.height,
      targetTop: targetRect.top,
      targetBottom: targetRect.bottom,
      spotlightHeight: spotlightRect.height,
      spotlightTop: spotlightRect.top,
      spotlightBottom: spotlightRect.bottom,
    }
  }, targetName)

  expect(metrics).not.toBeNull()
  const visibleTargetTop = Math.max(56, metrics!.targetTop - 10)
  const visibleTargetBottom = Math.min(await page.evaluate(() => window.innerHeight - 16), metrics!.targetBottom + 10)
  expect(metrics!.spotlightTop).toBeCloseTo(visibleTargetTop, 0)
  expect(metrics!.spotlightBottom).toBeCloseTo(visibleTargetBottom, 0)
  expect(metrics!.spotlightHeight).toBeGreaterThanOrEqual(96)
}

test('renders convert tab by default', async ({ page }) => {
  await markOnboardingComplete(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/en$/)
  await expect(page.getByRole('heading', { name: /Steam Artwork Studio/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run Conversion' })).toBeVisible()
  const sourceLink = page.getByRole('link', { name: 'GitHub' }).first()
  await expect(sourceLink).toHaveAttribute(
    'href',
    'https://github.com/lannahirave/steam-artwork-simplifier',
  )
  await expect(page.getByRole('link', { name: 'AGPL-3.0-or-later' }).first()).toHaveAttribute(
    'href',
    '/LICENSE.txt',
  )
  await expect(page.getByRole('link', { name: 'View' }).first()).toHaveAttribute(
    'href',
    '/THIRD_PARTY_NOTICES.txt',
  )
})

test('keeps advanced conversion controls behind a collapsed disclosure', async ({ page }) => {
  await markOnboardingComplete(page)
  await page.goto('/')

  const advancedOptions = page.getByTestId('advanced-options')
  const advancedSummary = page.getByTestId('advanced-options-summary')

  await expect(advancedOptions).not.toHaveAttribute('open')
  await expect(page.getByRole('heading', { name: 'Performance and Optimization' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Output Patching' })).toBeHidden()
  await expect(page.getByRole('spinbutton', { name: 'Worker Count' })).toBeHidden()
  await expect(page.getByRole('checkbox', { name: 'Enable precheck' })).toBeHidden()

  await advancedSummary.click()
  await expect(page.getByRole('heading', { name: 'Performance and Optimization' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Output Patching' })).toBeVisible()

  const lossyLevel = page.getByRole('spinbutton', { name: 'Lossy Level' })
  await lossyLevel.fill('3')
  await expect(advancedSummary).toContainText('1 custom setting')

  await advancedSummary.click()
  await advancedSummary.click()
  await expect(lossyLevel).toHaveValue('3')
})

for (const locale of ['en', 'uk', 'cs'] as const) {
  test(`renders ${locale} locale route`, async ({ page }) => {
    await markOnboardingComplete(page)
    await page.goto(`/${locale}`)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { name: /Steam Artwork Studio/i })).toBeVisible()
  })
}

test('language switch updates the locale route', async ({ page }) => {
  await markOnboardingComplete(page)
  await page.goto('/uk')
  await page.locator('select.nav-language').selectOption('en')
  await expect(page).toHaveURL(/\/en$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('button', { name: 'Run Conversion' })).toBeVisible()
})

test('shows browser warning and fail-fast diagnostics when isolation simulation is enabled', async ({ page }) => {
  await markOnboardingComplete(page)
  await page.goto('/?noiso=1')
  await expect(page).toHaveURL(/\/en\?noiso=1$/)
  await expect(page.getByRole('heading', { name: 'Media to GIF' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Conversion may not run in this browser' })).toBeVisible()
  await expect(page.getByText('This browser is not supported for browser-side ffmpeg/gifski conversion.')).toBeVisible()
  await expect(page.getByText('Technical diagnostics')).toBeVisible()

  await page.setInputFiles('input[type="file"]', {
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from([0, 0, 0, 0]),
  })
  await page.getByRole('button', { name: 'Run Conversion' }).click()
  const liveProgress = page.locator('.log-box')
  await expect(liveProgress.getByText('Browser support: unsupported')).toBeVisible()
  await expect(liveProgress.getByText('Reason [simulated-no-isolation]')).toBeVisible()
})

for (const userAgent of CHROME_DESKTOP_USER_AGENTS) {
  test(`does not show browser warning for desktop Chrome UA: ${userAgent}`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent })
    const page = await context.newPage()
    try {
      await markOnboardingComplete(page)
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Media to GIF' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Conversion may not run in this browser' })).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
}

for (const mobileUa of CHROME_MOBILE_USER_AGENTS) {
  test(`shows browser warning for Chrome on ${mobileUa.name}`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent: mobileUa.userAgent })
    const page = await context.newPage()
    try {
      await markOnboardingComplete(page)
      await page.goto('/')
      const warning = page.locator('.browser-support-warning')
      await expect(page.getByRole('heading', { name: 'Media to GIF' })).toBeVisible()
      await expect(warning.getByRole('heading', { name: 'Conversion may not run in this browser' })).toBeVisible()
      await expect(warning.locator('li strong').getByText(mobileUa.label, { exact: true })).toBeVisible()
      await warning.getByText('Technical diagnostics').click()
      await expect(warning.locator('pre').getByText(mobileUa.reason)).toBeVisible()
    } finally {
      await context.close()
    }
  })
}

test('shows steam helper snippets', async ({ page }) => {
  await markOnboardingComplete(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Steam Helpers', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Workshop Snippet' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Artwork or Featured Artwork Snippet' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Screenshot Snippet' })).toBeVisible()
})

test('runs onboarding once and allows reopening from help', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByLabel('Onboarding guide')).toBeVisible()
  await expect(page.getByText('Step 1 of 5')).toBeVisible()
  await expect(page.getByLabel('Onboarding guide').getByRole('heading', { name: 'Take a quick tour' })).toBeVisible()
  await expect(page.locator('.onboarding-spotlight')).toHaveCSS('opacity', '0')

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Step 2 of 5')).toBeVisible()
  await expect(page.getByLabel('Onboarding guide').getByRole('heading', { name: 'Convert' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Convert', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expectSpotlightFitsPanel(page, 'convert')

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Step 3 of 5')).toBeVisible()
  await expect(page.getByLabel('Onboarding guide').getByRole('heading', { name: 'Patch Tools' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Patch Tools', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expectSpotlightFitsPanel(page, 'patch')

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Step 4 of 5')).toBeVisible()
  await expect(page.getByLabel('Onboarding guide').getByRole('heading', { name: 'Steam Helpers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Steam Helpers', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expectSpotlightFitsPanel(page, 'steam')

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Step 5 of 5')).toBeVisible()
  await expect(page.getByLabel('Onboarding guide').getByRole('heading', { name: 'Guides' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guides', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expectSpotlightFitsPanel(page, 'guides')

  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByLabel('Onboarding guide')).toBeHidden()
  await expect(page.evaluate((storageKey) => localStorage.getItem(storageKey), ONBOARDING_STORAGE_KEY)).resolves.toBe(
    'true',
  )

  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(page.getByLabel('Onboarding guide')).toBeVisible()
  await expect(page.getByText('Step 1 of 5')).toBeVisible()
  await expect(page.getByLabel('Onboarding guide').getByRole('heading', { name: 'Take a quick tour' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Onboarding guide')).toBeHidden()

  await page.reload()
  await expect(page.getByLabel('Onboarding guide')).toBeHidden()

  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(page.getByLabel('Onboarding guide')).toBeVisible()
  await expect(page.getByText('Step 1 of 5')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Onboarding guide')).toBeHidden()
  await expect(page.evaluate((storageKey) => localStorage.getItem(storageKey), ONBOARDING_STORAGE_KEY)).resolves.toBe(
    'true',
  )
})
