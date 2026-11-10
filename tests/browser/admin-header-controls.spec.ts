import type { Page } from '@playwright/test'

import { expect, test } from './support/fixtures'
import { waitForHydration } from './support/journey'

const HEADER_ROUTES = [
  '/admin/posts',
  '/admin/pages',
  '/admin/comments',
  '/admin/taxonomy/categories',
  '/admin/taxonomy/tags',
  '/admin/taxonomy/friends',
  '/admin/library/images',
  '/admin/library/fonts',
  '/admin/security/users',
  '/admin/security/sessions',
  '/admin/security/audit-log',
  '/admin/me/comments',
  '/admin/me/sessions',
] as const

const HEADER_CONTROLS = [
  'button:visible',
  'input:not([type="hidden"]):not([aria-hidden="true"]):visible',
  '[role="combobox"]:visible',
  'fieldset[data-slot="input-group"]:visible',
].join(', ')

function expectedControlHeight(page: Page): Promise<number> {
  return page.evaluate(() => 2.25 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
}

for (const path of HEADER_ROUTES) {
  test(`uses the shared page-header control size on ${path}`, async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 1440, height: 900 })
    await adminPage.goto(path)
    await waitForHydration(adminPage, 'main header button')

    const controls = adminPage.locator('main header').first().locator(HEADER_CONTROLS)
    await expect(controls.first()).toBeVisible()
    const measurements = await controls.evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element)
        return {
          tag: element.tagName,
          height: element.getBoundingClientRect().height,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth),
        }
      }),
    )
    const expectedHeight = await expectedControlHeight(adminPage)
    expect(measurements.length).toBeGreaterThan(0)
    expect(
      measurements.every((control) => control.height === expectedHeight),
      JSON.stringify(measurements),
    ).toBe(true)
    const expectedBorderColor = measurements.find((control) => control.borderWidth > 0)?.borderColor
    const mismatchedBorders = measurements.filter(
      (control) => control.borderWidth > 0 && control.borderColor !== expectedBorderColor,
    )
    expect(mismatchedBorders, JSON.stringify(measurements)).toEqual([])

    await adminPage.screenshot({ path: test.info().outputPath(`header-${path.replaceAll('/', '-')}.png`) })
  })
}

test('unifies neutral filter borders in light and dark themes', async ({ adminPage }) => {
  await adminPage.setViewportSize({ width: 1440, height: 900 })
  await adminPage.goto('/admin/posts?status=published&category=c-1')
  await waitForHydration(adminPage, 'main header button')

  const filterBar = adminPage.getByRole('button', { name: '添加筛选' }).locator('..')
  const readBorderColors = () =>
    filterBar
      .locator('*')
      .evaluateAll((elements) =>
        Array.from(
          new Set(
            elements
              .filter((element) => Number.parseFloat(getComputedStyle(element).borderTopWidth) > 0)
              .map((element) => getComputedStyle(element).borderTopColor),
          ),
        ),
      )

  expect(await readBorderColors()).toHaveLength(1)
  await adminPage.screenshot({ path: test.info().outputPath('posts-filter-borders-light.png') })

  await adminPage.getByText('深色模式', { exact: true }).click()
  await expect(adminPage.locator('html')).toHaveClass(/dark/)
  await adminPage.waitForTimeout(700)
  expect(await readBorderColors()).toHaveLength(1)
  await adminPage.screenshot({ path: test.info().outputPath('posts-filter-borders-dark.png') })
  await adminPage.getByText('浅色模式', { exact: true }).click()
  await expect(adminPage.locator('html')).not.toHaveClass(/dark/)
})

test('matches the friends visibility option to the adjacent search input', async ({ adminPage }) => {
  await adminPage.setViewportSize({ width: 1440, height: 900 })
  await adminPage.goto('/admin/taxonomy/friends')
  await waitForHydration(adminPage, 'main header button')

  const input = adminPage.locator('main header input[type="search"]')
  const option = adminPage.locator('main header label[for="friends-include-hidden"]').locator('..')
  await expect(input).toBeVisible()
  await expect(option).toBeVisible()

  const [inputStyle, optionStyle] = await Promise.all(
    [input, option].map((control) =>
      control.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          height: element.getBoundingClientRect().height,
          borderColor: style.borderTopColor,
          borderRadius: style.borderTopLeftRadius,
        }
      }),
    ),
  )
  expect(optionStyle).toEqual(inputStyle)

  const checkbox = adminPage.getByRole('checkbox', { name: '包含已隐藏' })
  await adminPage.getByText('包含已隐藏', { exact: true }).click()
  await expect(checkbox).toHaveAttribute('aria-checked', 'true')
  await adminPage.getByText('包含已隐藏', { exact: true }).click()
  await expect(checkbox).toHaveAttribute('aria-checked', 'false')
  await adminPage.waitForTimeout(350)
  await checkbox.focus()
  await expect(checkbox).toBeFocused()
  expect(await checkbox.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none')

  for (const viewport of [
    { width: 390, height: 844, label: 'mobile' },
    { width: 1280, height: 800, label: 'laptop' },
    { width: 1440, height: 900, label: 'desktop' },
    { width: 1920, height: 1080, label: 'ultra-wide' },
  ]) {
    await adminPage.setViewportSize(viewport)
    await adminPage.screenshot({ path: test.info().outputPath(`friends-${viewport.label}.png`) })
    expect(await adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('uses shared sizes for dashboard quick actions and analytics export', async ({ adminPage }) => {
  await adminPage.setViewportSize({ width: 1440, height: 900 })

  await adminPage.goto('/admin')
  const expectedHeight = await expectedControlHeight(adminPage)
  const quickActions = adminPage
    .locator('main > div > div')
    .first()
    .getByRole('link', { name: /^(新建文章|新建页面|上传图片)$/ })
  await expect(quickActions).toHaveCount(3)
  await waitForHydration(adminPage, 'main a')
  expect(
    await quickActions.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height)),
  ).toEqual([expectedHeight, expectedHeight, expectedHeight])
  await adminPage.screenshot({ path: test.info().outputPath('header-admin-dashboard.png') })

  await adminPage.goto('/admin/analytics')
  const exportButton = adminPage.getByRole('button', { name: '导出 CSV' })
  await expect(exportButton).toBeVisible()
  await waitForHydration(adminPage, 'main button')
  expect((await exportButton.boundingBox())?.height).toBe(expectedHeight)
  await adminPage.screenshot({ path: test.info().outputPath('header-admin-analytics.png') })
})
