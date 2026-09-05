import { expect, test, type Page } from '@playwright/test'

import { assertHTML, focusEditor, html, initialize, selectBackwards } from '#/utils/e2e'

test.describe('Koenig Editor with basic nodes', function () {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.beforeEach(async () => {
    await initialize({ page, uri: '/#/basic?content=false' })
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('caret does not appear on empty editor', async function () {
    await focusEditor(page)
    await expect(page.locator('[data-inkling-plus-button]')).toHaveCount(0)
  })

  test('can add basic text', async function () {
    await focusEditor(page)

    await page.keyboard.type('Hello World')

    await assertHTML(page, html` <p dir="ltr"><span data-lexical-text="true">Hello World</span></p> `)
  })

  test('can add more than 1 paragraphs by typing manually', async function () {
    await focusEditor(page)

    await page.keyboard.type('Hello World')
    await page.keyboard.press('Enter')
    await page.keyboard.type('This is second para')

    await assertHTML(
      page,
      html`
        <p dir="ltr"><span data-lexical-text="true">Hello World</span></p>
        <p dir="ltr"><span data-lexical-text="true">This is second para</span></p>
      `,
    )
  })

  test('ignores hr card shortcut', async function () {
    await focusEditor(page)

    await page.keyboard.type('---')
    await page.keyboard.press('Enter')

    await assertHTML(
      page,
      html`
        <p><span data-lexical-text="true">---</span></p>
        <p><br /></p>
      `,
    )
  })

  test('ignores code block card shortcut', async function () {
    await focusEditor(page)
    await page.keyboard.type('```javascript ')

    await assertHTML(page, html` <p dir="ltr"><span data-lexical-text="true">\`\`\`javascript </span></p> `)
  })

  test('ignores slash menu on blank paragraph', async function () {
    await focusEditor(page)
    await expect(page.locator('[data-inkling-slash-menu]')).toHaveCount(0)
    await page.keyboard.type('/')
    await expect(page.locator('[data-inkling-slash-menu]')).toHaveCount(0)
  })

  test.describe('Floating format toolbar', () => {
    test('appears on text selection', async function () {
      await focusEditor(page)
      await page.keyboard.type('text for selection')

      await expect(page.locator('[data-inkling-floating-toolbar]')).toHaveCount(0)

      await selectBackwards(page, 'for selection'.length)

      await expect(page.locator('[data-inkling-floating-toolbar]')).toBeVisible()
    })

    test('does not has heading buttons', async function () {
      await focusEditor(page)
      await page.keyboard.type('text for selection')

      await expect(page.locator('[data-inkling-floating-toolbar]')).toHaveCount(0)

      await selectBackwards(page, 'for selection'.length)

      await expect(page.locator('[data-inkling-floating-toolbar]')).toBeVisible()

      const boldButtonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="bold"] button`
      await expect(page.locator(boldButtonSelector)).toBeVisible()

      const h2ButtonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="h2"] button`
      await expect(page.locator(h2ButtonSelector)).toHaveCount(0)

      const h3ButtonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="h3"] button`
      await expect(page.locator(h3ButtonSelector)).toHaveCount(0)
    })
  })
})
