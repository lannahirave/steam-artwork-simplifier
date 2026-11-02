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

/** The spotlight hugs the step's control (8px padding), and the tour card never covers it. */
async function expectSpotlightOn(page: Page, targetName: string): Promise<void> {
  const target = page.locator(`[data-onboarding-target="${targetName}"]`)
  await expect(target).toBeInViewport()
  await expect(page.locator('.onboarding-spotlight')).toHaveCSS('opacity', '1')

  await expect.poll(async () => {
    return page.evaluate((name) => {
      const targetRect = document.querySelector(`[data-onboarding-target="${name}"]`)?.getBoundingClientRect()
      const spotlightRect = document.querySelector('.onboarding-spotlight')?.getBoundingClientRect()
      const cardRect = document.querySelector('.onboarding-card')?.getBoundingClientRect()
      if (!targetRect || !spotlightRect || !cardRect) {
        return false
      }

      const hugs =
        Math.abs(spotlightRect.left - (targetRect.left - 8)) <= 1 &&
        Math.abs(spotlightRect.top - (targetRect.top - 8)) <= 1 &&
        Math.abs(spotlightRect.right - (targetRect.right + 8)) <= 1 &&
        Math.abs(spotlightRect.bottom - (targetRect.bottom + 8)) <= 1
      const overlaps =
        cardRect.left < targetRect.right &&
        cardRect.right > targetRect.left &&
        cardRect.top < targetRect.bottom &&
        cardRect.bottom > targetRect.top
      return hugs && !overlaps
    }, targetName)
  }).toBe(true)
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

for (const locale of ['en', 'uk', 'cs', 'es', 'zh'] as const) {
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
  await expect(page.getByRole('heading', { name: 'Before you paste: type allow pasting' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Upload many files at once' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fill in one upload form' })).toBeVisible()
  await page.getByRole('radio', { name: /Screenshot showcase/ }).check()
  await page.getByText('View script').first().click()
  const batchCode = page.locator('.steam-script-code pre').first()
  await expect(batchCode).toContainText('file_type: 5')
  await expect(batchCode).toContainText('consumer_app_id: 767')

  await page.getByRole('radio', { name: /Workshop showcase/ }).check()
  await expect(page.getByLabel('App ID')).toHaveValue('480')
  await expect(batchCode).toContainText('const DELAY_MS = 3000;')
  await page.getByLabel('Delay between uploads (seconds)').fill('5')
  await page.getByLabel('Visibility').selectOption({ label: 'Private' })
  await expect(batchCode).toContainText('const DELAY_MS = 5000;')
  await expect(batchCode).toContainText('const VISIBILITY = 2;')

  await page.getByLabel('App ID').fill('abc')
  await expect(page.getByRole('button', { name: 'Copy batch script' })).toBeDisabled()
  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  await expect(page.getByLabel('App ID')).toHaveValue('480')
  await expect(page.getByRole('button', { name: 'Copy batch script' })).toBeEnabled()
  await expect(batchCode).toContainText('const DELAY_MS = 3000;')

  await expect(page.getByRole('link', { name: 'create a GitHub issue' })).toHaveAttribute(
    'href',
    'https://github.com/lannahirave/steam-artwork-simplifier/issues/new',
  )
})

test('runs onboarding once and allows reopening from help', async ({ page }) => {
  await page.goto('/')
  const guide = page.getByLabel('Onboarding guide')
  const convertTab = page.getByRole('button', { name: 'Convert', exact: true })

  await expect(guide).toBeVisible()
  await expect(page.getByText('Step 1 of 4')).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Choose where it goes' })).toBeVisible()
  await expect(guide.getByRole('button', { name: 'Back' })).toHaveCount(0)
  await expectSpotlightOn(page, 'preset')

  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Step 2 of 4')).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Add your clip' })).toBeVisible()
  await expectSpotlightOn(page, 'source')

  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Step 3 of 4')).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'See it on your profile' })).toBeVisible()
  await expectSpotlightOn(page, 'nav-library')

  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Step 4 of 4')).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Upload to Steam' })).toBeVisible()
  await expectSpotlightOn(page, 'nav-steam')
  // The tour points at other tabs but never leaves Convert.
  await expect(convertTab).toHaveAttribute('aria-pressed', 'true')

  await guide.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByText('Step 3 of 4')).toBeVisible()
  await guide.getByRole('button', { name: 'Next' }).click()

  // Done lands on the first real action: the source file picker.
  await guide.getByRole('button', { name: 'Done' }).click()
  await expect(guide).toBeHidden()
  await expect(page.locator('[data-onboarding-target="source"] input[type="file"]')).toBeFocused()
  await expect(page.evaluate((storageKey) => localStorage.getItem(storageKey), ONBOARDING_STORAGE_KEY)).resolves.toBe(
    'true',
  )

  // Help reopens it from the start, on Convert, even from another tab.
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(guide).toBeVisible()
  await expect(page.getByText('Step 1 of 4')).toBeVisible()
  await expect(convertTab).toHaveAttribute('aria-pressed', 'true')
  await guide.getByRole('button', { name: 'Skip' }).click()
  await expect(guide).toBeHidden()

  await page.reload()
  await expect(guide).toBeHidden()

  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(guide).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(guide).toBeHidden()
})

test('folds the tabs and settings into a menu on narrow screens', async ({ page }) => {
  await markOnboardingComplete(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const toggle = page.getByRole('button', { name: 'Menu' })
  const libraryTab = page.getByRole('button', { name: 'Library', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toContainText('Convert')
  await expect(libraryTab).toBeHidden()
  // The header fits: nothing pushes the page wider than the screen.
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)

  await toggle.click()
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Help', exact: true })).toBeVisible()
  await libraryTab.click()
  await expect(libraryTab).toBeHidden()
  await expect(toggle).toContainText('Library')

  await toggle.click()
  await page.keyboard.press('Escape')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await toggle.click()
  await page.mouse.click(195, 700)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})
