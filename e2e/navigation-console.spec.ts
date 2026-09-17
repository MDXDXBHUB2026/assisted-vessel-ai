import { test, expect, type Page, type Locator } from '@playwright/test'

async function enterBridgeOperations(page: Page) {
  await page.goto('/')
  await page.getByText('ENTER BRIDGE OPERATIONS').click()
  await expect(page).toHaveURL(/#\/vessel\/console/)
}

async function goToNavigation(page: Page) {
  // The console dashboard's system topology panel also renders a "Navigation" node label, so a
  // plain text locator is ambiguous — the sidebar entry is specifically a link.
  await page.getByRole('link', { name: 'Navigation', exact: true }).click()
  await expect(page.getByTestId('navigation-ring')).toBeVisible()
}

async function readVectorPx(page: Page): Promise<number> {
  const value = await page.getByTestId('own-speed-vector').getAttribute('data-vector-px')
  expect(value).not.toBeNull()
  return Number(value)
}

/** WCAG relative luminance from an sRGB `rgb(r, g, b[, a])` computed-style string. */
function relativeLuminance(rgbString: string): number {
  const match = rgbString.match(/rgba?\(([^)]+)\)/)
  if (!match) throw new Error(`Not an rgb() colour: ${rgbString}`)
  const [r, g, b] = match[1]!.split(',').map((v) => Number(v.trim()) / 255)
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!)
}

async function clickTargetById(page: Page, targetId: string) {
  const decoration = page.locator(`[data-target-id="${targetId}"]`)
  const [tx, ty] = await Promise.all([decoration.getAttribute('data-tx'), decoration.getAttribute('data-ty')])
  expect(tx).not.toBeNull()
  expect(ty).not.toBeNull()
  const svg = page.getByTestId('navigation-ring-svg')
  const box = await svg.boundingBox()
  if (!box) throw new Error('navigation-ring-svg has no bounding box')
  // The SVG uses a fixed 400x300 viewBox scaled by CSS to the rendered box — convert the
  // decoration's viewBox-space coordinates to a page-space click point.
  const pageX = box.x + (Number(tx) / 400) * box.width
  const pageY = box.y + (Number(ty) / 300) * box.height
  await page.mouse.click(pageX, pageY)
}

test.describe('Navigation console — hybrid SVG chrome over canvas targets', () => {
  test('vector time (3 / 6 / 12 min) monotonically increases the rendered vector length', async ({ page }) => {
    await enterBridgeOperations(page)
    await goToNavigation(page)

    await page.getByTestId('nav-vector-3').click()
    const at3 = await readVectorPx(page)
    await page.getByTestId('nav-vector-6').click()
    const at6 = await readVectorPx(page)
    await page.getByTestId('nav-vector-12').click()
    const at12 = await readVectorPx(page)

    expect(at6).toBeGreaterThan(at3)
    expect(at12).toBeGreaterThan(at6)
  })

  test('exactly one orientation, motion mode and vector mode is active at a time, with correct state attributes', async ({ page }) => {
    await enterBridgeOperations(page)
    await goToNavigation(page)

    async function assertExactlyOneActive(testIds: string[]) {
      const states = await Promise.all(testIds.map((id) => page.getByTestId(id).getAttribute('data-state')))
      const activeCount = states.filter((s) => s === 'active').length
      expect(activeCount).toBe(1)
      for (let i = 0; i < testIds.length; i++) {
        const locator = page.getByTestId(testIds[i]!)
        const isActive = states[i] === 'active'
        await expect(locator).toHaveAttribute('aria-pressed', String(isActive))
        if (isActive) await expect(locator).toHaveAttribute('aria-current', 'true')
        else await expect(locator).not.toHaveAttribute('aria-current', 'true')
      }
    }

    await assertExactlyOneActive(['nav-orientation-north_up', 'nav-orientation-course_up'])
    await assertExactlyOneActive(['nav-motion-relative', 'nav-motion-true'])
    await assertExactlyOneActive(['nav-vector-3', 'nav-vector-6', 'nav-vector-12'])

    await page.getByTestId('nav-orientation-course_up').click()
    await assertExactlyOneActive(['nav-orientation-north_up', 'nav-orientation-course_up'])
    await expect(page.getByTestId('nav-orientation-course_up')).toHaveAttribute('data-state', 'active')
  })

  test('range change updates data-range-nm and the ring labels, and ring spacing equals range/4', async ({ page }) => {
    await enterBridgeOperations(page)
    await goToNavigation(page)

    // RANGE − disables auto and steps to the next smaller of the fixed MSC.192(79) scale set.
    await page.getByTestId('nav-range-dec').click()
    const ring = page.getByTestId('navigation-ring')
    const rangeNm = Number(await ring.getAttribute('data-range-nm'))
    expect(Number.isFinite(rangeNm)).toBe(true)

    const ringCircles = page.getByTestId('navigation-ring-range-ring')
    await expect(ringCircles).toHaveCount(4)
    const ringNms = await ringCircles.evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-ring-nm'))))
    ringNms.sort((a, b) => a - b)
    const spacing = rangeNm / 4
    for (let i = 0; i < 4; i++) {
      expect(ringNms[i]).toBeCloseTo(spacing * (i + 1), 1)
    }
  })

  test('selecting a target sets data-selected=true and renders the corner-square', async ({ page }) => {
    await enterBridgeOperations(page)
    await goToNavigation(page)

    const firstTarget = page.locator('[data-target-id]').first()
    const targetId = await firstTarget.getAttribute('data-target-id')
    expect(targetId).not.toBeNull()

    await expect(page.getByTestId('target-corner-square')).toHaveCount(0)
    await clickTargetById(page, targetId!)

    await expect(page.locator(`[data-target-id="${targetId}"]`)).toHaveAttribute('data-selected', 'true')
    await expect(page.getByTestId('target-corner-square')).toHaveCount(1)
    await expect(page.getByTestId('navigation-selected-panel')).toBeVisible()
  })

  test('night-palette conformance: the plot background is dark and no text renders pure white', async ({ page }) => {
    await enterBridgeOperations(page)
    await goToNavigation(page)

    const plotBackground = await page.getByTestId('navigation-ring').evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(relativeLuminance(plotBackground)).toBeLessThan(0.15)

    const textNodes: Locator[] = [
      page.getByTestId('readout-range'),
      page.getByTestId('readout-mode'),
      page.getByTestId('readout-vector'),
      page.getByTestId('readout-trail'),
      page.getByTestId('readout-limits'),
      page.getByTestId('nav-cpalimit-value'),
      page.getByTestId('nav-tcpalimit-value'),
    ]
    for (const node of textNodes) {
      const color = await node.evaluate((el) => getComputedStyle(el).color)
      expect(color).not.toBe('rgb(255, 255, 255)')
      expect(color).not.toBe('rgba(255, 255, 255, 1)')
    }
  })

  test('live numeric readouts use a monospaced, tabular-nums font', async ({ page }) => {
    await enterBridgeOperations(page)
    await goToNavigation(page)

    const numericNodes: Locator[] = [page.getByTestId('readout-range'), page.getByTestId('readout-vector'), page.getByTestId('nav-cpalimit-value'), page.getByTestId('nav-tcpalimit-value')]
    for (const node of numericNodes) {
      const style = await node.evaluate((el) => {
        const s = getComputedStyle(el)
        return { fontFamily: s.fontFamily, fontVariantNumeric: s.fontVariantNumeric }
      })
      expect(style.fontFamily.toLowerCase()).toContain('mono')
      expect(style.fontVariantNumeric).toContain('tabular-nums')
    }
  })

  test('reduced motion hides the sweep arc', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await enterBridgeOperations(page)
    await goToNavigation(page)

    await expect(page.locator('[data-testid="nav-sweep-arc"] path')).toBeHidden()
  })

  test('sweep arc is visible without reduced motion (control case)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await enterBridgeOperations(page)
    await goToNavigation(page)

    await expect(page.locator('[data-testid="nav-sweep-arc"] path')).toBeVisible()
  })

  test('visual regression: the plot area at rest, paused with animations disabled', async ({ page }) => {
    await enterBridgeOperations(page)
    await goToNavigation(page)

    await page.getByTitle('Pause simulation').click()
    await expect(page.getByTitle('Play simulation')).toBeVisible()
    // The canvas layer eases own-ship/target positions toward each tick's result over ~950ms via
    // its own rAF loop (independent of CSS `animations: disabled`, which only freezes real CSS
    // animations/transitions) — wait for that easing to fully converge so the screenshot is not
    // taken mid-interpolation, which would otherwise make the baseline flaky by a few pixels.
    await page.waitForTimeout(1200)

    // The simulation clock is wall-clock driven (docs/architecture.md §4), so own-ship/target
    // position at the moment PAUSE is clicked varies by a tick or two between runs even with the
    // settle wait above — a small pixel tolerance absorbs that without masking a real regression
    // (a broken layout or missing element produces a far larger diff than this).
    await expect(page.getByTestId('navigation-ring')).toHaveScreenshot('navigation-ring-at-rest.png', { animations: 'disabled', maxDiffPixelRatio: 0.03 })
  })
})
