import { test, expect } from '@playwright/test'

test('landing page loads and shows the command entry points', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Assisted Vessel Intelligence', { exact: true })).toBeVisible()
  await expect(page.getByText('ENTER BRIDGE OPERATIONS')).toBeVisible()
})

test('landing page footer shows the contact block above the synthetic-data disclaimer', async ({ page }) => {
  await page.goto('/')

  const linkedIn = page.locator('a[href*="linkedin.com/in/manojrajanuae"]')
  const email = page.locator('a[href^="mailto:"]')
  const disclaimer = page.getByText(/This independent technology demonstrator uses entirely synthetic operational data/)

  await expect(linkedIn).toBeVisible()
  await expect(email).toBeVisible()
  await expect(disclaimer).toBeVisible()

  const [linkedInBox, emailBox, disclaimerBox] = await Promise.all([linkedIn.boundingBox(), email.boundingBox(), disclaimer.boundingBox()])
  expect(disclaimerBox!.y).toBeGreaterThan(linkedInBox!.y)
  expect(disclaimerBox!.y).toBeGreaterThan(emailBox!.y)
})
