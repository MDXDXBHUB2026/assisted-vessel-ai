import { test, expect } from '@playwright/test'

test.describe('Small-screen console gate', () => {
  test('at 375x812, a console route shows the small-screen notice instead of the console', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/#/vessel/navigation')

    await expect(page.getByTestId('small-screen-notice')).toBeVisible()
    await expect(page.getByText('Desktop Display Required')).toBeVisible()
    await expect(page.getByTestId('navigation-canvas-surface')).toHaveCount(0)
    await expect(page.getByTestId('navigation-ring')).toHaveCount(0)

    await page.getByRole('link', { name: /Return to the landing page/i }).click()
    await expect(page.getByText('ENTER BRIDGE OPERATIONS')).toBeVisible()
  })

  test('at 375x812, the landing page still renders its value proposition and disclaimer with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    await expect(page.getByText('Assisted Vessel Intelligence', { exact: true })).toBeVisible()
    await expect(page.getByText('ENTER BRIDGE OPERATIONS')).toBeVisible()
    await expect(page.getByText(/This independent technology demonstrator uses entirely synthetic operational data/)).toBeVisible()

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewportWidth + 2)
  })

  test('at 1440x900, the console renders in full: navigation canvas and safety risk matrix', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/#/vessel/navigation')

    await expect(page.getByTestId('small-screen-notice')).toHaveCount(0)
    const canvas = page.getByTestId('navigation-canvas-surface')
    await expect(canvas).toBeVisible()
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox?.width ?? 0).toBeGreaterThan(0)

    await page.goto('/#/vessel/safety')
    const riskMatrix = page.getByTestId('risk-matrix')
    await expect(riskMatrix).toBeVisible()
    const riskMatrixBox = await riskMatrix.boundingBox()
    expect(riskMatrixBox?.height ?? 0).toBeGreaterThan(100)
  })

  test('resizing a desktop browser narrow shows the notice, and widening restores the console without a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/#/vessel/navigation')
    await expect(page.getByTestId('small-screen-notice')).toHaveCount(0)
    await expect(page.getByTestId('navigation-canvas-surface')).toBeVisible()

    await page.setViewportSize({ width: 600, height: 900 })
    await expect(page.getByTestId('small-screen-notice')).toBeVisible()
    await expect(page.getByTestId('navigation-canvas-surface')).toHaveCount(0)

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByTestId('small-screen-notice')).toHaveCount(0)
    await expect(page.getByTestId('navigation-canvas-surface')).toBeVisible()
  })
})
