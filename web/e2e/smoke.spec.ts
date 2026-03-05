import { expect, test } from '@playwright/test'

test('renders convert tab by default', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Steam Artwork Studio/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run Conversion' })).toBeVisible()
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
