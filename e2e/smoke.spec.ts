import { test, expect } from '@playwright/test'

test('landing page loads and shows the command entry points', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Assisted Vessel Intelligence', { exact: true })).toBeVisible()
  await expect(page.getByText('ENTER BRIDGE OPERATIONS')).toBeVisible()
})
