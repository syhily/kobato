import { expect, test, type Page } from '@playwright/test'

import { focusEditor, initialize } from '#/utils/e2e'

test.describe('Labels (i18n seam)', () => {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test.describe('default labels', function () {
    test.beforeEach(async () => {
      await initialize({ page, uri: '/#/?content=false' })
    })

    test('shows the default English placeholder', async function () {
      await expect(page.getByText('Begin writing your post...')).toBeVisible()
    })

    test('shows the default English slash-menu labels', async function () {
      await focusEditor(page)
      await page.keyboard.type('/img')

      const menuItems = page.locator('[data-inkling-slash-menu] [role="menuitem"]')
      await expect(menuItems).toHaveCount(1)
      await expect(menuItems.first()).toContainText('Image')
    })
  })

  test.describe('zh label overrides (?labels=zh)', function () {
    test.beforeEach(async () => {
      await initialize({ page, uri: '/#/?content=false&labels=zh' })
    })

    test('shows the overridden placeholder', async function () {
      await expect(page.getByText('开始创作你的文章……')).toBeVisible()
    })

    test('resolves overridden slash-menu labels while matches stay declared', async function () {
      await focusEditor(page)
      // array-form matches ('img') are declared keywords and still filter under zh labels
      await page.keyboard.type('/img')

      const menuItems = page.locator('[data-inkling-slash-menu] [role="menuitem"]')
      await expect(menuItems).toHaveCount(1)
      await expect(menuItems.first()).toContainText('图片')
      await expect(menuItems.first()).toHaveAttribute('data-inkling-card-menu-item', '图片')
    })

    test('keeps non-overridden keys on their English defaults', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')

      await expect(page.locator('[data-inkling-card-menu-item="Divider"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-menu-item="图片"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-menu-item="Image"]')).not.toBeVisible()
    })

    test('resolves section headings', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')

      const slashMenu = page.locator('[data-inkling-slash-menu]')
      await expect(slashMenu).toContainText('主要')
      await expect(slashMenu).not.toContainText('Primary')
    })
  })
})
