import { test, type Page } from '@playwright/test'

import { assertHTML, focusEditor, html, initialize, pasteText, selectBackwards } from '#/utils/e2e'

test.describe('Links', () => {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.beforeEach(async () => {
    await initialize({ page })
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('converts selected text to link on url paste', async function () {
    await focusEditor(page)
    await page.keyboard.type('link')
    await selectBackwards(page, 4)
    await pasteText(page, 'https://inkling.local')
    await assertHTML(
      page,
      html`
        <p dir="ltr">
          <a href="https://inkling.local" dir="ltr">
            <span data-lexical-text="true">link</span>
          </a>
        </p>
      `,
    )
  })

  test('does not convert text to link if pasting a non-url', async function () {
    await focusEditor(page)
    await page.keyboard.type('link')
    await selectBackwards(page, 4)
    await pasteText(page, 'Hello Inkling')
    await assertHTML(
      page,
      html`
        <p dir="ltr">
          <span data-lexical-text="true">Hello Inkling</span>
        </p>
      `,
    )
  })
})
