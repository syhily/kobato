import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  createSnippet,
  ctrlOrCmd,
  focusEditor,
  html,
  initialize,
  waitForCardContentSynced,
  waitForEditorQuiet,
} from '#/utils/e2e'

async function insertToggleCard(page: Page) {
  await page.keyboard.type('/toggle')
  await page.waitForSelector('[data-inkling-card-menu-item="Toggle"][data-inkling-cardmenu-selected="true"]')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-inkling-card="toggle"]')
}

test.describe('Toggle card', () => {
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

  test('can import serialized toggle card nodes', async function () {
    const contentParam = encodeURIComponent(
      JSON.stringify({
        root: {
          children: [
            {
              type: 'toggle',
              heading: '<span><em>Heading</em></span>', // heading shouldn't have wrapper element like <p> or <h4>
              content: '<p dir="ltr"><span>Content</span></p>',
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      }),
    )

    await initialize({ page, uri: `/#/?content=${contentParam}` })

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="toggle">
            <div class="rounded border border-grey/40 px-6 py-4 dark:border-grey/30">
              <div class="flex cursor-text items-start justify-between">
                <div class="mr-2 w-full">
                  <div class="inkling-lexical-heading">
                    <div data-inkling="editor">
                      <div
                        contenteditable="false"
                        role="textbox"
                        spellcheck="true"
                        data-lexical-editor="true"
                        aria-autocomplete="none"
                        aria-readonly="true"
                      >
                        <p dir="ltr"><em data-lexical-text="true">Heading</em></p>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="mt-[-1px] ml-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center">
                  <svg></svg>
                </div>
              </div>
              <div class="visible mt-2 w-full">
                <div>
                  <div data-inkling="editor">
                    <div
                      contenteditable="false"
                      role="textbox"
                      spellcheck="true"
                      data-lexical-editor="true"
                      aria-autocomplete="none"
                      aria-readonly="true"
                    >
                      <p dir="ltr"><span data-lexical-text="true">Content</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div></div>
          </div>
        </div>
      `,
      { ignoreCardToolbarContents: true, ignoreInnerSVG: true },
    )
  })

  test('renders toggle card node from slash command', async function () {
    await focusEditor(page)
    await insertToggleCard(page)

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="toggle">
            <div class="rounded border border-grey/40 px-6 py-4 dark:border-grey/30">
              <div class="flex cursor-text items-start justify-between">
                <div class="mr-2 w-full">
                  <div class="inkling-lexical-heading">
                    <div data-inkling="editor">
                      <div contenteditable="true" role="textbox" spellcheck="true" data-lexical-editor="true">
                        <p><br /></p>
                      </div>
                    </div>
                    <div><div>Toggle header</div></div>
                  </div>
                </div>
                <div class="mt-[-1px] ml-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center">
                  <svg></svg>
                </div>
              </div>
              <div class="visible mt-2 w-full">
                <div>
                  <div data-inkling="editor">
                    <div contenteditable="true" role="textbox" spellcheck="true" data-lexical-editor="true">
                      <p><br /></p>
                    </div>
                  </div>
                  <div><div>Collapsible content</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p><br /></p>
      `,
      { ignoreInnerSVG: true },
    )
  })

  test('focuses on the heading input when rendered', async function () {
    await focusEditor(page)
    await insertToggleCard(page)

    await page.keyboard.type('Heading')

    const heading = page.locator('.inkling-lexical-heading')
    await expect(heading).toContainText('Heading')
  })

  test('focuses on the content input when "Enter" is pressed from the heading input', async function () {
    await focusEditor(page)
    await insertToggleCard(page)

    await page.keyboard.press('Enter')
    await page.keyboard.type('Content')
  })

  test('focuses on the content input when "Tab" is pressed from the heading input', async function () {
    await focusEditor(page)
    await insertToggleCard(page)

    await page.keyboard.press('Tab')
    await page.keyboard.type('Content')
  })

  test('focuses on the content input when "Arrow Down" is pressed from the heading input', async function () {
    await focusEditor(page)
    await insertToggleCard(page)

    await page.keyboard.press('ArrowDown')
    await page.keyboard.type('Content')
  })

  test('focuses on the heading input when "Arrow Up" is pressed from the content input', async function () {
    await focusEditor(page)
    await insertToggleCard(page)

    await page.keyboard.press('ArrowDown')
    await page.keyboard.type('Content')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.type('Heading')

    const heading = page.locator('.inkling-lexical-heading')
    await expect(heading).toContainText('Heading')
  })

  test('renders in display mode when unfocused', async function () {
    await focusEditor(page)
    await insertToggleCard(page)

    // add some content to avoid auto-removal when leaving empty
    await page.keyboard.type('Heading')

    // Shift focus away from heading field
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(50)

    // Shift focus away from content field
    await page.keyboard.press('ArrowDown')

    const toggleCard = page.locator('[data-inkling-card="toggle"]')
    await expect(toggleCard).toHaveAttribute('data-inkling-card-editing', 'false')
  })

  test('renders an action toolbar', async function () {
    await focusEditor(page)
    await insertToggleCard(page)

    // Add some content to avoid auto-removal
    await page.keyboard.type('Heading')

    // Shift focus away from toggle card
    await page.keyboard.press('Escape')

    const editButton = page.locator('[data-inkling-card-toolbar="toggle"]')
    await expect(editButton).toBeVisible()
  })

  test('is removed when left empty', async function () {
    await focusEditor(page)
    await insertToggleCard(page)

    // Shift focus away from heading field
    await page.keyboard.press('ArrowDown')
    // Wait for focus change to register in Chrome for Testing
    await page.waitForTimeout(50)

    // Shift focus away from content field
    await page.keyboard.press('ArrowDown')

    const toggleCard = page.locator('[data-inkling-card="toggle"]')
    await expect(toggleCard).not.toBeVisible()
  })

  test('can add snippet', async function () {
    await focusEditor(page)
    await insertToggleCard(page)

    // Add some content to avoid auto-removal
    await page.keyboard.type('Heading')

    // create snippet
    await page.keyboard.press('Escape')
    await createSnippet(page)

    // can insert card from snippet
    await page.keyboard.press('Enter')
    await page.keyboard.type('/snippet')
    await expect(page.locator('[data-inkling-cardmenu-selected="true"]').filter({ hasText: 'snippet' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-inkling-card="toggle"]')).toHaveCount(2)
  })

  test('can undo/redo without losing nested editor content', async () => {
    await focusEditor(page)
    await insertToggleCard(page)

    await page.keyboard.type('Test title')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Test description')
    // let the nested editor's sync to the card node settle so its history
    // entries don't interleave with the deletion entries below
    await waitForCardContentSynced(page, 'toggle', 'Test description')
    // Exit card edit mode, then use Enter+Backspace×2 to delete so undo
    // has a proper history entry. Direct Escape→Backspace doesn't create a
    // main editor content update between card insertion and deletion, so the
    // two operations merge in the undo history (known Lexical limitation with
    // decorator nodes whose nested editors don't create main editor updates).
    await page.keyboard.press('Escape')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Backspace')
    // First Backspace deletes the empty paragraph and selects the card; wait for
    // the selection so the update has committed before the merge-window wait
    // starts — under load the commit lags the keyup, shrinking the effective gap.
    await expect(page.locator('[data-inkling-card="toggle"]')).toHaveAttribute('data-inkling-card-selected', 'true')
    // Lexical's history merges consecutive same-type changes within 1000ms;
    // wait for full update-silence past the merge window (across the nested
    // editors too — a late nested update would pollute the deletion's undo
    // entry) so the card deletion becomes its own undo group.
    await waitForEditorQuiet(page)
    await page.keyboard.press('Backspace')
    // wait for the deletion to commit so the undo below targets it
    await expect(page.locator('[data-inkling-card="toggle"]')).not.toBeVisible()
    await page.keyboard.press(`${ctrlOrCmd(page)}+z`)

    // verify the card is restored and selected after undo
    await expect(page.locator('[data-inkling-card="toggle"]')).toBeVisible()
    await expect(page.locator('[data-inkling-card="toggle"]')).toHaveAttribute('data-inkling-card-selected', 'true')

    // verify content is preserved
    const titleEditor = page.locator('[data-inkling-card="toggle"] [data-inkling="editor"]').nth(0)
    await expect(titleEditor).toContainText('Test title')
    const contentEditor = page.locator('[data-inkling-card="toggle"] [data-inkling="editor"]').nth(1)
    await expect(contentEditor).toContainText('Test description')
  })
})
