import { expect, test, type Page } from '@playwright/test'

import { assertHTML, ctrlOrCmd, focusEditor, html, initialize } from '#/utils/e2e'

// The demo's musicPlayer card is a host card (CONTEXT.md: "host card")
// declared through the public defineCard seam — these tests pin that the
// derived views (slash menu, insert, selection protocol) treat it like a
// built-in card.
test.describe('Host card', () => {
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

  test('appears in the slash menu', async function () {
    await focusEditor(page)
    await page.keyboard.type('/music')

    await expect(page.locator('[data-inkling-card-menu-item="Music"]')).toBeVisible()
  })

  test('inserts via the slash menu', async function () {
    await focusEditor(page)
    await page.keyboard.type('/music')
    await expect(
      page.locator('[data-inkling-card-menu-item="Music"][data-inkling-cardmenu-selected="true"]'),
    ).toBeVisible()
    await page.keyboard.press('Enter')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="true"
            data-inkling-card="musicPlayer"
          ></div>
        </div>
        <p dir="auto"><br data-lexical-managed-linebreak="true" /></p>
      `,
      { ignoreCardContents: true },
    )
  })

  // e2b5c6a2 regression: a card whose class is missing the isInklingCard()
  // stamp fails registerCardSelection's $isInklingCard gate, so the selection
  // store clears it on the next update — the card can never stay selected, and
  // an undo-restored card selection is dropped during decorator
  // reconciliation. The assembled host card must survive both.
  test('keeps its selection across updates', async function () {
    await focusEditor(page)
    await page.keyboard.type('/music')
    await page.keyboard.press('Enter')
    await page.locator('[data-inkling-card="musicPlayer"]').click()

    const selectedCard = page.locator('[data-inkling-card="musicPlayer"][data-inkling-card-selected="true"]')
    await expect(selectedCard).toBeVisible()
    // the failing shape deselects the card in the update right after the
    // click, so assert again once that update has landed
    await page.waitForTimeout(200)
    await expect(selectedCard).toBeVisible()

    // undo restores the card's NodeSelection from history; the reconciliation
    // updates that follow must not clear it either
    await page.keyboard.press('Backspace')
    await expect(page.locator('[data-inkling-card="musicPlayer"]')).toHaveCount(0)
    await page.keyboard.press(`${ctrlOrCmd(page)}+z`)
    await expect(selectedCard).toBeVisible()
  })

  test('deletes as a whole', async function () {
    await focusEditor(page)
    await page.keyboard.type('/music')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-inkling-card="musicPlayer"][data-inkling-card-selected="true"]')).toBeVisible()

    await page.keyboard.press('Backspace')

    await assertHTML(page, html`<p dir="auto"><br data-lexical-managed-linebreak="true" /></p>`)
  })
})
