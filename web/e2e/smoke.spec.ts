import { expect, test, type Page } from '@playwright/test'

const ONBOARDING_STORAGE_KEY = 'steam-artwork-studio:onboarding-complete'

async function markOnboardingComplete(page: Page): Promise<void> {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, 'true')
  }, ONBOARDING_STORAGE_KEY)
}

async function expectSpotlightFitsPanel(page: Page, targetName: string): Promise<void> {
  await expect(page.locator(`[data-onboarding-target="${targetName}"]`)).toBeInViewport()
  await expect(page.locator('.onboarding-spotlight')).toHaveCSS('opacity', '1')

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
      spotlightHeight: spotlightRect.height,
    }
  }, targetName)

  expect(metrics).not.toBeNull()
  expect(metrics!.spotlightHeight).toBeLessThanOrEqual(metrics!.targetHeight + 24)
  expect(metrics!.spotlightHeight).toBeLessThanOrEqual(584)
}

test('renders convert tab by default', async ({ page }) => {
  await markOnboardingComplete(page)
  await page.goto('/')
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

test('shows blocking screen when isolation simulation is enabled', async ({ page }) => {
  await page.goto('/?noiso=1')
  await expect(page.getByRole('heading', { name: 'Cross-Origin Isolation Required' })).toBeVisible()
  await expect(page.getByText('Cross-Origin-Opener-Policy: same-origin')).toBeVisible()
})

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
