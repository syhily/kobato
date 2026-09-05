import { test, type Page } from '@playwright/test'

import { assertHTML, focusEditor, html, initialize } from '#/utils/e2e'

test.describe('Renders horizontal line rule', () => {
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

  test('renders horizontal line rule', async function () {
    await focusEditor(page)
    await page.keyboard.type('---')
    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="horizontalrule">
            <hr />
          </div>
        </div>
        <p><br /></p>
      `,
    )
  })
})
