import { test, type Page } from '@playwright/test'

import { assertHTML, focusEditor, html, initialize } from '#/utils/e2e'

test.describe('Renders code block node', () => {
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

  test('renders code block node in edit mode', async function () {
    await focusEditor(page)
    await page.keyboard.type('```javascript ')
    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="codeblock"></div>
        </div>
      `,
      { ignoreCardContents: true },
    )
  })
})
