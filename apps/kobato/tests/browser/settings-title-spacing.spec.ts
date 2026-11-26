import { expect, test } from '@kobato/pack/browser/fixtures'
import { openSettings } from '@kobato/pack/browser/journey'

const ANALYTICS_NAV_LABEL = '分析统计'
const COLLECTION_TITLE = '采集与过滤策略'

test.beforeEach(async ({ settingsApi }) => {
  await settingsApi.resetGeneral()
})

test('settings section titles have balanced spacing with adjacent cards', async ({ adminPage: page }) => {
  await openSettings(page)

  await page.locator('aside').getByRole('button', { name: ANALYTICS_NAV_LABEL, exact: true }).click()

  const content = page.locator('#settings-content-scroller')
  const sectionTitle = content.getByRole('heading', { name: ANALYTICS_NAV_LABEL, exact: true })
  const cardTitle = content.getByRole('heading', { name: COLLECTION_TITLE, exact: true })
  await expect(sectionTitle).toBeInViewport()
  await expect(cardTitle).toBeInViewport()

  const spacing = await sectionTitle.evaluate((element) => {
    const previous = element.previousElementSibling
    const next = element.nextElementSibling
    if (previous === null || next === null) {
      throw new Error('section title must sit between the previous and current card containers')
    }
    const titleRect = element.getBoundingClientRect()
    return {
      above: titleRect.top - previous.getBoundingClientRect().bottom,
      below: next.getBoundingClientRect().top - titleRect.bottom,
    }
  })

  expect(spacing.below).toBeCloseTo(spacing.above, 5)
  await page.screenshot({ path: test.info().outputPath('settings-title-spacing.png') })
})
