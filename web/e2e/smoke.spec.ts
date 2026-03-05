import { expect, test } from '@playwright/test'

test('renders convert tab by default', async ({ page }) => {
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
  await page.goto('/')
  await page.getByRole('button', { name: 'Steam Helpers' }).click()
  await expect(page.getByRole('heading', { name: 'Workshop Snippet' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Artwork or Featured Artwork Snippet' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Screenshot Snippet' })).toBeVisible()
})
