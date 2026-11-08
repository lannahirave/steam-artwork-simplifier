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
  await expect(page.getByRole('heading', { name: 'Classic scripts' })).toBeVisible()
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
  const editor = page.locator('dialog.source-editor')

  await expect(guide).toBeVisible()
  await expect(page.getByText('Step 1 of 10', { exact: true })).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Choose where it goes' })).toBeVisible()
  await expect(guide.getByRole('button', { name: 'Back' })).toHaveCount(0)
  await expectSpotlightOn(page, 'preset')
  // Focus starts in the card, so keyboard and screen reader users land on the tour.
  await expect(guide).toBeFocused()

  // Add your clip waits for a clip; Use sample clip is offered while the tour runs.
  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Step 2 of 10', { exact: true })).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Add your clip' })).toBeVisible()
  await expectSpotlightOn(page, 'source')
  await expect(guide.getByRole('button', { name: 'Add a clip to continue' })).toBeDisabled()
  await page.getByRole('button', { name: 'Use sample clip' }).click()

  // The loaded clip moves the tour on to Edit source.
  await expect(guide.getByRole('heading', { name: 'Make it fit' })).toBeVisible()
  await expect(page.getByText('Step 3 of 10', { exact: true })).toBeVisible()
  await expectSpotlightOn(page, 'source-preview')
  await guide.getByRole('button', { name: 'Open Edit source' }).click()

  // Inside the editor the card moves into the dialog, the only part of the page that stays usable.
  await expect(editor).toBeVisible()
  await expect(editor.getByLabel('Onboarding guide')).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Crop the frame' })).toBeVisible()
  await expect(page.getByText('Step 4 of 10', { exact: true })).toBeVisible()
  await expectSpotlightOn(page, 'editor-crop')
  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(guide.getByRole('heading', { name: 'Trim the clip' })).toBeVisible()
  await expectSpotlightOn(page, 'editor-trim')
  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(guide.getByRole('heading', { name: 'Keep your edits' })).toBeVisible()
  await expectSpotlightOn(page, 'editor-actions')

  // Apply and continue closes the editor and goes on to the tabs.
  await guide.getByRole('button', { name: 'Apply and continue' }).click()
  await expect(editor).toBeHidden()
  await expect(page.getByText('Step 7 of 10', { exact: true })).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'See it on your profile' })).toBeVisible()
  await expectSpotlightOn(page, 'nav-library')

  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(guide.getByRole('heading', { name: 'Fix GIFs you already have' })).toBeVisible()
  await expectSpotlightOn(page, 'nav-patch')
  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(guide.getByRole('heading', { name: 'Upload to Steam' })).toBeVisible()
  await expectSpotlightOn(page, 'nav-steam')
  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Step 10 of 10', { exact: true })).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Follow a guide' })).toBeVisible()
  await expectSpotlightOn(page, 'nav-guides')
  // The tour points at other tabs but never leaves Convert.
  await expect(convertTab).toHaveAttribute('aria-pressed', 'true')

  await guide.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByText('Step 9 of 10', { exact: true })).toBeVisible()
  // Each step is announced, not just redrawn.
  await expect(guide.locator('[aria-live="polite"]')).toContainText('Step 9 of 10. Upload to Steam.')
  await guide.getByRole('button', { name: 'Next' }).click()

  // Done lands on the next real action: Run Conversion, now that a clip is loaded.
  await guide.getByRole('button', { name: 'Done' }).click()
  await expect(guide).toBeHidden()
  await expect(page.getByRole('button', { name: 'Run Conversion' })).toBeFocused()
  await expect(page.evaluate((storageKey) => localStorage.getItem(storageKey), ONBOARDING_STORAGE_KEY)).resolves.toBe(
    'true',
  )

  // Help reopens it from the start, on Convert, even from another tab.
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(guide).toBeVisible()
  await expect(page.getByText('Step 1 of 10', { exact: true })).toBeVisible()
  await expect(convertTab).toHaveAttribute('aria-pressed', 'true')
  await guide.getByRole('button', { name: 'Skip' }).click()
  await expect(guide).toBeHidden()
  // Skip hands focus back to the Help button that opened the tour.
  await expect(page.getByRole('button', { name: 'Help', exact: true })).toBeFocused()

  await page.reload()
  await expect(guide).toBeHidden()

  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(guide).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(guide).toBeHidden()
  await expect(page.getByRole('button', { name: 'Help', exact: true })).toBeFocused()
})

test('the tour follows the user in and out of Edit source', async ({ page }) => {
  await page.goto('/')
  const guide = page.getByLabel('Onboarding guide')
  const editor = page.locator('dialog.source-editor')
  await guide.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Use sample clip' }).click()
  await expect(guide.getByRole('heading', { name: 'Make it fit' })).toBeVisible()

  // Opening the editor with its own button counts too.
  await page.locator('[data-onboarding-target="edit-source"]').click()
  await expect(guide.getByRole('heading', { name: 'Crop the frame' })).toBeVisible()

  // Back from the first editor step cancels the editor and returns to Make it fit.
  await guide.getByRole('button', { name: 'Back' }).click()
  await expect(editor).toBeHidden()
  await expect(guide.getByRole('heading', { name: 'Make it fit' })).toBeVisible()

  // Escape inside the editor closes the editor, not the tour, and the tour moves on to the tabs.
  await guide.getByRole('button', { name: 'Open Edit source' }).click()
  await expect(guide.getByRole('heading', { name: 'Crop the frame' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()
  await expect(guide.getByRole('heading', { name: 'See it on your profile' })).toBeVisible()

  // Back from the tabs skips the closed editor's steps.
  await guide.getByRole('button', { name: 'Back' }).click()
  await expect(guide.getByRole('heading', { name: 'Make it fit' })).toBeVisible()
})

test('offers the sample clip only during the tour', async ({ page }) => {
  await markOnboardingComplete(page)
  await page.goto('/')

  const sampleButton = page.getByRole('button', { name: 'Use sample clip' })
  await expect(page.locator('[data-onboarding-target="source"] input[type="file"]')).toBeVisible()
  await expect(sampleButton).toHaveCount(0)

  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await page.getByLabel('Onboarding guide').getByRole('button', { name: 'Next' }).click()
  await sampleButton.click()

  // It goes through the real file input, so the input carries the file and the preview opens.
  await expect
    .poll(() =>
      page.locator('[data-onboarding-target="source"] input[type="file"]').evaluate(
        (input: HTMLInputElement) => input.files?.[0]?.name ?? '',
      ),
    )
    .toBe('sample-clip.mp4')
  await expect(page.getByRole('region', { name: 'Cut Preview' })).toBeVisible()
  await expect(sampleButton).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run Conversion' })).toBeEnabled()
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

  // Escape from inside the panel returns focus to the menu button instead of dropping it.
  await toggle.click()
  await page.getByRole('button', { name: 'Help', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(toggle).toBeFocused()

  await toggle.click()
  await page.mouse.click(195, 700)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})
