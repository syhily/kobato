import { expect, test } from './support/fixtures'
import { openSettings } from './support/journey'

const ANALYTICS_NAV_LABEL = '分析统计'
const COLLECTION_TITLE = '采集与过滤策略'

test('settings section and card titles use the same typography', async ({ adminPage: page }) => {
  await openSettings(page)

  await page.locator('aside').getByRole('button', { name: ANALYTICS_NAV_LABEL, exact: true }).click()

  const content = page.locator('#settings-content-scroller')
  const sectionTitle = content.getByRole('heading', { name: ANALYTICS_NAV_LABEL, exact: true })
  const cardTitle = content.getByRole('heading', { name: COLLECTION_TITLE, exact: true })
  await expect(sectionTitle).toBeVisible()
  await expect(cardTitle).toBeVisible()
  await expect(sectionTitle).toBeInViewport()
  await expect(cardTitle).toBeInViewport()

  const sectionTypography = await sectionTitle.evaluate((element) => {
    const styles = getComputedStyle(element)
    return {
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      letterSpacing: styles.letterSpacing,
    }
  })

  await expect(cardTitle).toHaveCSS('font-family', sectionTypography.fontFamily)
  await expect(cardTitle).toHaveCSS('font-size', sectionTypography.fontSize)
  await expect(cardTitle).toHaveCSS('font-weight', sectionTypography.fontWeight)
  await expect(cardTitle).toHaveCSS('letter-spacing', sectionTypography.letterSpacing)

  await page.screenshot({ path: 'tmp/settings-typography.png' })
})
