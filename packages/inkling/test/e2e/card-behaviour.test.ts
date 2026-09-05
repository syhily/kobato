import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  assertSelection,
  ctrlOrCmd,
  focusEditor,
  getBoundingBox,
  getScrollPosition,
  html,
  initialize,
  insertCard,
} from '#/utils/e2e'

test.describe('Card behaviour', () => {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await initialize({ page })
  })

  test.afterAll(async () => {
    await page.close()
  })

  test.describe('CLICKS', function () {
    test('click selects card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('---')

      // clicking first HR card makes it selected
      await page.click('hr')
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      // clicking second HR card deselects the first and selects the second
      await page.click('[data-lexical-decorator]:nth-of-type(2) hr')
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    test('click keeps selection', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.click('hr')
      await page.click('hr')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    test('click off deselects', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.click('hr')
      await page.click('p')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    test('click outside editor deselects', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.click('hr')
      await page.click('body')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    test('double-click on an unselected card puts it into edit mode', async function () {
      await focusEditor(page)
      // TODO: Update this after setting to isEditing on creation
      await page.keyboard.type('```javascript ')

      await page.click('div[data-inkling-card="codeblock"]')
      await page.click('div[data-inkling-card="codeblock"]')

      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()
    })

    test('single clicking on a selected card puts it into edit mode', async function () {
      await focusEditor(page)
      // TODO: Update this after setting to isEditing on creation
      await page.keyboard.type('```javascript ')
      // Click to select
      await page.click('div[data-inkling-card="codeblock"]')
      // Click to edit
      await page.click('div[data-inkling-card="codeblock"]')

      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()
    })

    test('clicking outside the edit mode card switches back to display mode', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await page.keyboard.type('```javascript ')
      await page.waitForSelector('[data-inkling-card="codeblock"] [contenteditable="true"]')
      // clicking outside an EMPTY edit-mode card removes it instead of
      // switching it to display mode ($deselectCard in card-adjacency.ts
      // removes cards whose isEmpty() is true — the empty case is covered by
      // 'clicking outside the empty edit mode card removes the card' below),
      // so this test gives the card content first
      await page.keyboard.type('import React from "react"')

      await page.click('div[data-inkling-card="codeblock"]')
      await page.click('div[data-inkling-card="codeblock"]')

      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()

      await page.click('p')
      await expect(page.locator('[data-inkling-card-editing="false"]')).toBeVisible()
    })

    test('clicking outside the editor and then on a card focuses the editor', async function () {
      await focusEditor(page)
      await page.keyboard.type('```javascript ')
      await page.keyboard.type('import React from "react"')

      const title = page.getByTestId('post-title')
      await title.click()
      let titleHasFocus = await title.evaluate((node) => document.activeElement === node)
      expect(titleHasFocus).toEqual(true)

      await page.click('div[data-inkling-card="codeblock"]')
      const editor = page.locator('div.inkling-prose').first()
      let editorHasFocus = await editor.evaluate((node) => document.activeElement === node)
      expect(editorHasFocus).toEqual(true)
    })

    test('clicking outside the empty edit mode card removes the card', async function () {
      await focusEditor(page)
      await page.keyboard.type('```javascript ')

      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()

      await page.click('.inkling-lexical')
      await assertHTML(page, html` <p><br /></p> `)
    })

    test('clicking on another card when a card is in edit mode selected new card and switches old card to display mode', async function () {
      await focusEditor(page)
      await page.keyboard.type('```python ')
      await page.waitForSelector('[data-inkling-card="codeblock"] [contenteditable="true"]')
      await page.keyboard.type('import pandas as pd')
      await page.keyboard.press('Meta+Enter')
      await page.waitForSelector(
        '[data-inkling-card="codeblock"][data-inkling-card-selected="true"][data-inkling-card-editing="false"]',
      )
      await page.keyboard.press('Enter')
      await page.keyboard.type('```javascript ')
      await page.waitForSelector('[data-inkling-card="codeblock"] [contenteditable="true"]')
      await page.keyboard.type('import React from "react"')
      await page.keyboard.press('Meta+Enter')
      await page.waitForSelector(
        '[data-inkling-card="codeblock"][data-inkling-card-selected="true"][data-inkling-card-editing="false"]',
      )

      // Neither card should be in editing mode right now
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="codeblock"
            ></div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="true"
              data-inkling-card="codeblock"
            ></div>
          </div>
        `,
        { ignoreCardContents: true, ignoreCardToolbarContents: true },
      )

      // Select the python card
      await page.click('div[data-inkling-card="codeblock"]')
      // Click the selected card again to enter editing mode
      await page.click('div[data-inkling-card-selected="true"]')

      // Now the first card should be editing and the second card should not be
      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-editing="false"]')).toBeVisible()

      // Click the card that's not currently editing (second card)
      await page.click('div[data-inkling-card-editing="false"]')
      // Now neither card should be editing
      await expect(page.locator('[data-inkling-card-editing="true"]')).toHaveCount(0)

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="codeblock">
              <div>
                <pre><code class="language-python">import pandas as pd</code></pre>
                <div><span>python</span></div>
              </div>
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="codeblock">
              <div>
                <pre><code class="language-javascript">import React from "react"</code></pre>
                <div><span>javascript</span></div>
              </div>
              <figcaption></figcaption>
              <div data-inkling-card-toolbar="code-block"></div>
            </div>
          </div>
        `,
        { ignoreCardToolbarContents: true, ignoreCardCaptionContents: true },
      )
    })

    test('clicking below the editor focuses the editor if last node is a paragraph', async function () {
      await focusEditor(page)
      await page.keyboard.type('Here is some text')

      await page.mouse.click(100, 900)
      await assertSelection(page, {
        anchorOffset: 1,
        anchorPath: [0],
        focusOffset: 1,
        focusPath: [0],
      })
    })

    test('clicking below the editor focuses the editor if last node is a card', async function () {
      await focusEditor(page)
      await page.keyboard.type('```javascript ')
      await page.waitForSelector('[data-inkling-card="codeblock"] .cm-editor')
      await page.keyboard.type('import React from "react"')
      await page.keyboard.press('Meta+Enter')
      await page.waitForSelector(
        '[data-inkling-card="codeblock"][data-inkling-card-selected="true"][data-inkling-card-editing="false"]',
      )

      await page.mouse.click(100, 900)

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="codeblock"
            ></div>
          </div>
          <p><br /></p>
        `,
        { ignoreCardContents: true },
      )

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1],
        focusOffset: 0,
        focusPath: [1],
      })
    })

    test('clicking in the space between cards selects the card under it', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('```javascript ')
      await page.waitForSelector('[data-inkling-card="codeblock"] .cm-editor')
      await page.keyboard.type('import React from "react"')
      await page.keyboard.press('Meta+Enter')
      await page.keyboard.press('ArrowUp')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="codeblock"
            ></div>
          </div>
        `,
        { ignoreCardContents: true },
      )

      await page.mouse.click(275, 275)

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="true"
              data-inkling-card="codeblock"
            ></div>
          </div>
        `,
        { ignoreCardContents: true },
      )
    })
  })

  test.describe('LEFT', function () {
    // deselects card and moves cursor onto paragraph
    test('with selected card after paragraph', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await page.click('hr')

      await assertHTML(
        page,
        html`
          <p><br /></p>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('ArrowLeft')

      await assertHTML(
        page,
        html`
          <p><br /></p>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0],
        focusOffset: 0,
        focusPath: [0],
      })
    })

    // moves selection to previous card
    test('when selected card is after card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('---')

      await page.keyboard.press('ArrowLeft')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('ArrowLeft')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    // triggers "caret left at top" prop fn
  })

  test.describe('RIGHT', function () {
    test('with selected card before paragraph', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.click('hr')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('ArrowRight')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1],
        focusOffset: 0,
        focusPath: [1],
      })
    })

    // moves selection to previous card
    test('when selected card is before card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('---')
      await page.click('hr')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('ArrowRight')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('ArrowRight')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [2],
        focusOffset: 0,
        focusPath: [2],
      })
    })
  })

  test.describe('UP', function () {
    // moves caret to end of paragraph
    test('with selected card after paragraph', async function () {
      await focusEditor(page)
      await page.keyboard.type('First line')
      await page.keyboard.down('Shift')
      await page.keyboard.press('Enter')
      await page.keyboard.up('Shift')
      await page.keyboard.type('Second line')
      await page.keyboard.press('Enter')
      await insertCard(page, { cardName: 'divider' })

      // sanity check
      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <span data-lexical-text="true">First line</span>
            <br />
            <span data-lexical-text="true">Second line</span>
          </p>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.click('[data-inkling-card="horizontalrule"]')
      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()

      await page.keyboard.press('ArrowUp')

      // caret is at end of second line of paragraph
      await assertSelection(page, {
        anchorOffset: 11,
        anchorPath: [0, 2, 0],
        focusOffset: 11,
        focusPath: [0, 2, 0],
      })

      // card is no longer selected
      await expect(page.locator('[data-inkling-card-selected="true"]')).toHaveCount(0)
    })

    // selects the previous card
    test('with selected card after card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('---')
      await page.click('[data-lexical-decorator]:nth-of-type(2)')

      // sanity check, second card is selected
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('ArrowUp')

      // first card is now selected
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    // selects the card once caret reaches top of paragraph
    test('moving through paragraph to card', async function ({ browser }) {
      // Use an isolated page because this test asserts paragraph structure and
      // caret navigation that can be affected by shared page state from earlier
      // tests in this describe block.
      const page = await browser.newPage()
      await initialize({ page })
      await focusEditor(page)

      await page.keyboard.type('---')
      await expect(page.locator('[data-inkling-card="horizontalrule"]')).toBeVisible()

      // Use explicit line breaks so line positions are deterministic across
      // OS/browser font metrics, then click near the top of the paragraph and
      // ArrowUp once to select the card above.
      await page.keyboard.type('First line of text')
      await page.keyboard.down('Shift')
      await page.keyboard.press('Enter')
      await page.keyboard.up('Shift')
      await page.keyboard.type('Second line of text')
      await page.keyboard.down('Shift')
      await page.keyboard.press('Enter')
      await page.keyboard.up('Shift')
      await page.keyboard.type('Third line of text')

      const paragraph = page.locator('[data-lexical-editor] > p').first()
      const box = await getBoundingBox(paragraph)
      await page.mouse.click(box.x + 1, box.y + 5)
      await page.keyboard.press('ArrowUp')

      // card is selected
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p dir="ltr">
            <span data-lexical-text="true">First line of text</span>
            <br />
            <span data-lexical-text="true">Second line of text</span>
            <br />
            <span data-lexical-text="true">Third line of text</span>
          </p>
        `,
      )

      await page.close()
    })

    test('moving through paragraph with breaks to card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('First line')
      await page.keyboard.down('Shift')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await page.keyboard.up('Shift')
      await page.keyboard.type('Second line after break')

      // sanity check, caret is at end of second line after break
      await assertSelection(page, {
        anchorOffset: 23,
        anchorPath: [1, 3, 0],
        focusOffset: 23,
        focusPath: [1, 3, 0],
      })

      await page.keyboard.press('ArrowUp')

      // caret moved to empty line
      await assertSelection(page, {
        anchorOffset: 2,
        anchorPath: [1],
        focusOffset: 2,
        focusPath: [1],
      })

      await page.keyboard.press('ArrowUp')

      // caret moved to end of first line
      await assertSelection(page, {
        anchorOffset: 10,
        anchorPath: [1, 0, 0],
        focusOffset: 10,
        focusPath: [1, 0, 0],
      })

      await page.keyboard.press('ArrowUp')

      // card is selected
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p dir="ltr">
            <span data-lexical-text="true">First line</span>
            <br />
            <br />
            <span data-lexical-text="true">Second line after break</span>
          </p>
        `,
      )
    })
  })

  test.describe('DOWN', function () {
    // moves caret to beginning of paragraph
    test('with selected card before paragraph', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('First line')
      await page.keyboard.down('Shift')
      await page.keyboard.press('Enter')
      await page.keyboard.up('Shift')
      await page.keyboard.type('Second line')

      await page.click('[data-lexical-decorator]')

      // sanity check
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p dir="ltr">
            <span data-lexical-text="true">First line</span>
            <br />
            <span data-lexical-text="true">Second line</span>
          </p>
        `,
      )

      await page.keyboard.press('ArrowDown')

      // caret is at beginning of paragraph
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1, 0, 0],
        focusOffset: 0,
        focusPath: [1, 0, 0],
      })

      // card is no longer selected
      await expect(page.locator('[data-inkling-card-selected="true"]')).toHaveCount(0)
    })

    // selects the next card
    test('with selected card before card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('---')
      await page.click('[data-lexical-decorator]')

      // sanity check, first card is selected
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('ArrowDown')

      // first card is now selected
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    // selects the card once caret reaches bottom of paragraph
    test('moving through paragraph to card', async function () {
      await focusEditor(page)
      await page.keyboard.type('First line')
      await page.keyboard.down('Shift')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await page.keyboard.up('Shift')
      await page.keyboard.type('Second line after break')
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')

      // place cursor at beginning of first line
      const pHandle = page.locator('[data-lexical-editor] > p').nth(0)
      const pRect = await getBoundingBox(pHandle)
      await page.mouse.click(pRect.x + 5, pRect.y + 5)

      // sanity check
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0, 0, 0],
        focusOffset: 0,
        focusPath: [0, 0, 0],
      })

      await page.keyboard.press('ArrowDown')

      // caret on blank break line
      await assertSelection(page, {
        anchorOffset: 2,
        anchorPath: [0],
        focusOffset: 2,
        focusPath: [0],
      })

      await page.keyboard.press('ArrowDown')

      // caret on second line after break
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0, 3, 0],
        focusOffset: 0,
        focusPath: [0, 3, 0],
      })

      // wait for cursor position to be painted so getClientRects() is accurate
      // when the ArrowDown handler checks if cursor is at bottom of element
      await page.waitForTimeout(50)
      await page.keyboard.press('ArrowDown')

      // card is selected
      await expect(
        page.locator('[data-inkling-card="horizontalrule"][data-inkling-card-selected="true"]'),
      ).toBeVisible()
    })

    test('with selected card at end of document', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.press('Backspace')

      // sanity check
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
        `,
      )

      await page.keyboard.press('ArrowDown')

      // should create a new paragraph and move cursor to it
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await assertSelection(page, {
        anchorPath: [1],
        anchorOffset: 0,
        focusPath: [1],
        focusOffset: 0,
      })
    })
  })

  test.describe('ENTER', function () {
    test('with selected card creates paragraph after and moves selection', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.click('hr')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('Enter')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
          <p><br /></p>
        `,
      )

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1],
        focusOffset: 0,
        focusPath: [1],
      })
    })
  })

  test.describe('BACKSPACE', function () {
    // deletes card and puts cursor at end of previous paragraph
    test('with selected card after paragraph', async function () {
      await focusEditor(page)
      await page.keyboard.type('Testing')
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await page.click('hr')

      await assertHTML(
        page,
        html`
          <p dir="ltr"><span data-lexical-text="true">Testing</span></p>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('Backspace')

      await assertHTML(
        page,
        html`
          <p dir="ltr"><span data-lexical-text="true">Testing</span></p>
          <p><br /></p>
        `,
      )

      await assertSelection(page, {
        anchorOffset: 7,
        anchorPath: [0, 0, 0],
        focusOffset: 7,
        focusPath: [0, 0, 0],
      })
    })

    test('with selected card after card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('---')
      await page.click('[data-lexical-decorator]:nth-of-type(2) hr')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('Backspace')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    test('with selected card as first section followed by paragraph', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('Testing')
      await page.click('hr')
      await page.keyboard.press('Backspace')

      await assertHTML(page, html` <p dir="ltr"><span data-lexical-text="true">Testing</span></p> `)

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0, 0, 0],
        focusOffset: 0,
        focusPath: [0, 0, 0],
      })
    })

    test('with selected card as first section followed by card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('---')
      await page.click('hr')
      await page.keyboard.press('Backspace')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    test('with selected card as only node', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Backspace')

      await assertHTML(page, html` <p><br /></p> `)
    })

    // deletes empty paragraph, selects card
    test('on empty paragraph after card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await expect(page.locator('[data-inkling-card="horizontalrule"]')).toBeVisible()
      await page.keyboard.press('Enter')
      await page.keyboard.type('Populated paragraph after empty paragraph')
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(50)

      // sanity check - cursor is on empty paragraph
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1],
        focusOffset: 0,
        focusPath: [1],
      })

      await page.keyboard.press('Backspace')

      // wait for the card to be selected after backspace removes the empty paragraph
      await expect(page.locator('[data-inkling-card="horizontalrule"]')).toHaveAttribute(
        'data-inkling-card-selected',
        'true',
      )

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p dir="ltr"><span data-lexical-text="true">Populated paragraph after empty paragraph</span></p>
        `,
      )
    })

    // deletes card, keeps selection at beginning of paragraph
    test('at beginning of paragraph after card', async function () {
      await focusEditor(page)
      await page.keyboard.type('First paragraph')
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      // Wait for HR card to be created before typing
      await expect(page.locator('[data-inkling-card="horizontalrule"]')).toBeVisible()
      await page.keyboard.type('Second paragraph')
      for (let i = 0; i < 'Second paragraph'.length; i++) {
        await page.keyboard.press('ArrowLeft')
      }
      // Wait for selection to settle after arrow key navigation
      await page.waitForTimeout(50)

      await assertHTML(
        page,
        html`
          <p dir="ltr"><span data-lexical-text="true">First paragraph</span></p>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p dir="ltr"><span data-lexical-text="true">Second paragraph</span></p>
        `,
      )

      // sanity check - cursor is at beginning of second paragraph
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [2, 0, 0],
        focusOffset: 0,
        focusPath: [2, 0, 0],
      })

      await page.keyboard.press('Backspace')

      await assertHTML(
        page,
        html`
          <p dir="ltr"><span data-lexical-text="true">First paragraph</span></p>
          <p dir="ltr"><span data-lexical-text="true">Second paragraph</span></p>
        `,
      )

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1, 0, 0],
        focusOffset: 0,
        focusPath: [1, 0, 0],
      })
    })

    test('at start of list after a card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('* Test')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <ul>
            <li value="1" dir="ltr"><span data-lexical-text="true">Test</span></li>
          </ul>
        `,
      )

      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('Backspace')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p dir="ltr"><span data-lexical-text="true">Test</span></p>
        `,
      )
    })

    test('at start of a quote block after a card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('> Test')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <blockquote dir="ltr"><span data-lexical-text="true">Test</span></blockquote>
        `,
      )

      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('Backspace')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p dir="ltr"><span data-lexical-text="true">Test</span></p>
        `,
      )
    })

    test('at start of an aside after a card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('> Test')
      await page.keyboard.press('Control+q')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <aside dir="ltr"><span data-lexical-text="true">Test</span></aside>
        `,
      )

      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('Backspace')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p dir="ltr"><span data-lexical-text="true">Test</span></p>
        `,
      )
    })
  })

  test.describe('DELETE', function () {
    test('with selected card before paragraph', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('Testing')
      await page.click('hr')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p dir="ltr"><span data-lexical-text="true">Testing</span></p>
        `,
      )

      await page.keyboard.press('Delete')

      await assertHTML(page, html` <p dir="ltr"><span data-lexical-text="true">Testing</span></p> `)

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0, 0, 0],
        focusOffset: 0,
        focusPath: [0, 0, 0],
      })
    })

    test('with selected card before card', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('---')
      await page.click('hr')

      await page.keyboard.press('Delete')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    test('with selected card as only node', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Delete')

      await assertHTML(page, html` <p><br /></p> `)
    })

    // deletes paragraph and selects card
    test('on empty paragraph before card', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')

      await assertHTML(
        page,
        html`
          <p><br /></p>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0],
        focusOffset: 0,
        focusPath: [0],
      })

      await page.keyboard.press('Delete')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      await page.keyboard.press('Delete')

      await assertHTML(page, html` <p><br /></p> `)

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0],
        focusOffset: 0,
        focusPath: [0],
      })
    })

    // deletes card, keeping caret at end of paragraph
    test('at end of paragraph before card', async function () {
      await focusEditor(page)
      await page.keyboard.type('First paragraph')
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await expect(page.locator('[data-inkling-card="horizontalrule"]')).toBeVisible()
      await page.keyboard.type('Second paragraph')
      await page.click('[data-lexical-editor] > p:first-of-type')
      await page.keyboard.press('End')
      // Wait for selection to be registered in Chrome for Testing
      await page.waitForTimeout(50)

      await assertSelection(page, {
        anchorOffset: 15,
        anchorPath: [0, 0, 0],
        focusOffset: 15,
        focusPath: [0, 0, 0],
      })

      await page.keyboard.press('Delete')

      await assertHTML(
        page,
        html`
          <p dir="ltr"><span data-lexical-text="true">First paragraph</span></p>
          <p dir="ltr"><span data-lexical-text="true">Second paragraph</span></p>
        `,
      )

      await assertSelection(page, {
        anchorOffset: 15,
        anchorPath: [0, 0, 0],
        focusOffset: 15,
        focusPath: [0, 0, 0],
      })

      await page.keyboard.press('Delete')

      await assertHTML(
        page,
        html` <p dir="ltr"><span data-lexical-text="true">First paragraphSecond paragraph</span></p> `,
      )
    })

    test('at start of formatted text in paragraph before card', async function () {
      await focusEditor(page)
      await page.keyboard.type('Before ')
      await page.keyboard.press(`${ctrlOrCmd(page)}+i`)
      await page.keyboard.type('italic')
      await page.keyboard.press(`${ctrlOrCmd(page)}+i`)
      await page.keyboard.type(' after')
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')

      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <span data-lexical-text="true">Before </span>
            <em data-lexical-text="true">italic</em>
            <span data-lexical-text="true"> after</span>
          </p>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            ></div>
          </div>
          <p><br /></p>
        `,
        { ignoreCardContents: true },
      )

      await page.locator('em').click({ position: { x: 0, y: 0 } })

      await assertSelection(page, {
        anchorOffset: 7,
        anchorPath: [0, 0, 0],
        focusOffset: 7,
        focusPath: [0, 0, 0],
      })

      await page.keyboard.press('Delete')

      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <span data-lexical-text="true">Before </span>
            <em data-lexical-text="true">talic</em>
            <span data-lexical-text="true"> after</span>
          </p>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            ></div>
          </div>
          <p><br /></p>
        `,
        { ignoreCardContents: true },
      )
    })
  })

  test.describe('modifier Backspace beside cards', () => {
    test.describe('macOS delete-line semantics', () => {
      test.beforeEach(async ({ page }) => {
        const isMac = await page.evaluate(() => navigator.platform.includes('Mac'))
        // SKIP-REASON: Meta+Backspace maps to delete-line only on macOS; other platforms use Control+Backspace for delete-word.
        test.skip(!isMac, 'macOS Meta+Backspace semantics only')
      })

      test('removes a one-line paragraph after a card and selects the card', async function () {
        await focusEditor(page)
        await page.keyboard.type('---')
        await page.keyboard.type('Some content')

        await page.keyboard.press('Meta+Backspace')

        await assertHTML(
          page,
          html`
            <div data-lexical-decorator="true" contenteditable="false">
              <div
                data-inkling-card-editing="false"
                data-inkling-card-selected="true"
                data-inkling-card="horizontalrule"
              >
                <hr />
              </div>
            </div>
          `,
        )
      })

      test('removes the first line of a multi-line paragraph and keeps the card unselected', async function () {
        await focusEditor(page)
        await page.keyboard.type('---')
        await page.keyboard.type('Some content')
        await page.keyboard.press('Shift+Enter')
        await page.keyboard.press('Shift+Enter')
        await page.keyboard.type('Some more content')

        // Place the caret at the end of the first visual line deterministically
        // (ArrowUp can mis-fire in headless browsers with zero-height line breaks).
        await page.evaluate(() => {
          const editor = (window as unknown as { lexicalEditor: { getRootElement: () => HTMLElement | null } })
            .lexicalEditor
          const rootElement = editor.getRootElement()
          if (!rootElement) {
            throw new Error('Expected editor root element')
          }
          const paragraph = rootElement.querySelector('p')
          const span = paragraph?.querySelector('span[data-lexical-text="true"]')
          const textNode = span?.firstChild
          if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
            throw new Error('Expected first paragraph text node')
          }
          const offset = textNode.textContent?.length ?? 0
          const range = document.createRange()
          range.setStart(textNode, offset)
          range.setEnd(textNode, offset)
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(range)
          document.dispatchEvent(new Event('selectionchange'))
        })
        await page.waitForTimeout(50)

        await page.keyboard.press('Meta+Backspace')

        await assertHTML(
          page,
          html`
            <div data-lexical-decorator="true" contenteditable="false">
              <div
                data-inkling-card-editing="false"
                data-inkling-card-selected="false"
                data-inkling-card="horizontalrule"
              >
                <hr />
              </div>
            </div>
            <p dir="ltr">
              <br />
              <br />
              <span data-lexical-text="true">Some more content</span>
            </p>
          `,
        )
      })
    })

    test.describe('Linux/Windows delete-word semantics', () => {
      test.beforeEach(async ({ page }) => {
        const isMac = await page.evaluate(() => navigator.platform.includes('Mac'))
        // SKIP-REASON: Control+Backspace maps to delete-word on Linux/Windows; macOS uses Meta+Backspace for delete-line.
        test.skip(isMac, 'Control+Backspace semantics on non-macOS')
      })

      test('removes the last word and preserves the previous card', async function () {
        await focusEditor(page)
        await page.keyboard.type('---')
        await page.keyboard.type('Some content')

        await page.keyboard.press('Control+Backspace')

        await assertHTML(
          page,
          html`
            <div data-lexical-decorator="true" contenteditable="false">
              <div
                data-inkling-card-editing="false"
                data-inkling-card-selected="false"
                data-inkling-card="horizontalrule"
              >
                <hr />
              </div>
            </div>
            <p dir="ltr"><span data-lexical-text="true">Some </span></p>
          `,
        )
      })

      test('removes the last word on the first line and preserves the paragraph', async function () {
        await focusEditor(page)
        await page.keyboard.type('---')
        await page.keyboard.type('first line')
        await page.keyboard.press('Shift+Enter')
        await page.keyboard.press('Shift+Enter')
        await page.keyboard.type('later line')

        // Place the caret at the end of the first visual line deterministically
        // (ArrowUp can mis-fire in headless browsers with zero-height line breaks).
        await page.evaluate(() => {
          const editor = (window as unknown as { lexicalEditor: { getRootElement: () => HTMLElement | null } })
            .lexicalEditor
          const rootElement = editor.getRootElement()
          if (!rootElement) {
            throw new Error('Expected editor root element')
          }
          const paragraph = rootElement.querySelector('p')
          const span = paragraph?.querySelector('span[data-lexical-text="true"]')
          const textNode = span?.firstChild
          if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
            throw new Error('Expected first paragraph text node')
          }
          const offset = textNode.textContent?.length ?? 0
          const range = document.createRange()
          range.setStart(textNode, offset)
          range.setEnd(textNode, offset)
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(range)
          document.dispatchEvent(new Event('selectionchange'))
        })
        await page.waitForTimeout(50)

        await page.keyboard.press('Control+Backspace')

        await assertHTML(
          page,
          html`
            <div data-lexical-decorator="true" contenteditable="false">
              <div
                data-inkling-card-editing="false"
                data-inkling-card-selected="false"
                data-inkling-card="horizontalrule"
              >
                <hr />
              </div>
            </div>
            <p dir="ltr">
              <span data-lexical-text="true">first </span>
              <br />
              <br />
              <span data-lexical-text="true">later line</span>
            </p>
          `,
        )
      })
    })
  })

  test.describe('CMD+ENTER', function () {
    test('with a non-edit-mode card selected', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.click('hr')

      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()

      await page.keyboard.press('Meta+Enter')

      // a horizontal rule has no edit mode (its spec sets hasEditMode: false),
      // so cmd+enter cannot toggle it — the press falls through to the
      // selected-card Enter branch in keyboard-navigation/enter.ts, which
      // inserts a fresh paragraph after the card and moves the caret into it,
      // deselecting the card
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
          <p><br /></p>
        `,
      )
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1],
        focusOffset: 0,
        focusPath: [1],
      })
    })

    test('with an edit-mode card selected', async function () {
      await focusEditor(page)
      await page.keyboard.type('``` ')
      await page.waitForSelector('[data-inkling-card="codeblock"] .cm-editor')
      await page.keyboard.type('import React from "react"')
      await page.click('[data-inkling-card="codeblock"]')

      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()

      await page.keyboard.press('Meta+Enter')

      // card exits edit mode
      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-editing="false"]')).toBeVisible()

      await page.keyboard.press('Meta+Enter')

      // card enters edit mode
      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()
    })

    test('cursor position when deselecting empty card with nested editor', async function () {
      // Focus/cursor position was not correct when a card with a nested editor was deselected+removed,
      // an extra reset was occurring putting the cursor at the start of the document.
      // See upstream issue #3430
      await focusEditor(page)
      await page.keyboard.type('Testing')
      await page.keyboard.press('Enter')
      await insertCard(page, { cardName: 'header' })
      await page.keyboard.press('Meta+Enter')

      // focus is on blank paragraph that's left after empty card is removed
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1],
        focusOffset: 0,
        focusPath: [1],
      })
    })
  })

  test.describe('ESCAPE', function () {
    test('with an edit mode card that is not empty', async function () {
      await focusEditor(page)
      await page.keyboard.type('``` ')
      await page.waitForSelector('[data-inkling-card="codeblock"]')
      await page.keyboard.type('import React from "react"')

      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()

      await page.keyboard.press('Escape')

      // card exits edit mode
      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-editing="false"]')).toBeVisible()

      // card is still able to re-enter edit mode with CMD+ENTER
      await page.keyboard.press('Meta+Enter')

      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()
    })

    test('with an edit mode card that is empty', async function () {
      await focusEditor(page)
      await page.keyboard.type('``` ')
      await page.waitForSelector('[data-inkling-card="codeblock"]')

      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()

      await page.keyboard.press('Escape')

      // card is removed leaving the empty paragraph
      await assertHTML(page, html` <p><br /></p> `)

      // paragraph is selected
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0],
        focusOffset: 0,
        focusPath: [0],
      })
    })

    test('with an edit mode card that is empty before existing content', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.type('Testing')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.type('``` ')
      await page.waitForSelector('[data-inkling-card="codeblock"]')

      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()

      await page.keyboard.press('Escape')

      // card is removed leaving the existing paragraph
      await assertHTML(page, html` <p dir="ltr"><span data-lexical-text="true">Testing</span></p> `)

      // cursor is at beginning of trailing paragraph
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0, 0, 0],
        focusOffset: 0,
        focusPath: [0, 0, 0],
      })
    })

    test('with an edit mode card that is empty before another card', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.type('``` ')
      await page.waitForSelector('[data-inkling-card="codeblock"]')

      await expect(page.locator('[data-inkling-card-selected="true"]')).toBeVisible()
      await expect(page.locator('[data-inkling-card-editing="true"]')).toBeVisible()

      await page.keyboard.press('Escape')

      // card is removed leaving the existing card
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )

      // test editor does actually have focus by trying to move the caret
      await page.keyboard.press('ArrowDown')

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1],
        focusOffset: 0,
        focusPath: [1],
      })
    })
  })

  test.describe('SELECTION', function () {
    test('shift+down does not put card in selected state', async function () {
      await focusEditor(page)
      await page.keyboard.type('First')
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await expect(page.locator('[data-inkling-card="horizontalrule"]')).toBeVisible()
      await page.keyboard.type('Second')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('Home')
      // Wait for selection to be registered in Chrome for Testing
      await page.waitForTimeout(50)

      // sanity check
      await assertSelection(page, {
        anchorPath: [0, 0, 0],
        anchorOffset: 0,
        focusPath: [0, 0, 0],
        focusOffset: 0,
      })

      await page.keyboard.down('Shift')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.up('Shift')
      // Wait for selection to be registered in Chrome for Testing
      await page.waitForTimeout(50)

      // offsets are based on the root node offset
      // anchorOffset can be 0 or 1 depending on how Chrome resolves
      // the root-level selection (paragraph vs decorator boundary)
      await assertSelection(page, {
        anchorPath: [],
        anchorOffset: [0, 1],
        focusPath: [],
        focusOffset: 2,
      })
      // this is a range selection, so the card is not explicitly selected
      await expect(page.locator('[data-inkling-card-selected="true"]')).not.toBeVisible()
    })

    test('shift+up does not put card in selected state', async function () {
      await focusEditor(page)
      await page.keyboard.type('First')
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await page.keyboard.type('Second')

      // sanity check
      await assertSelection(page, {
        anchorPath: [2, 0, 0],
        anchorOffset: 6,
        focusPath: [2, 0, 0],
        focusOffset: 6,
      })

      await page.keyboard.down('Shift')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.up('Shift')

      // offsets are based on the root node offset
      await assertSelection(page, {
        anchorPath: [],
        anchorOffset: 3,
        focusPath: [],
        focusOffset: 1,
      })
      // this is a range selection, so the card is not explicitly selected
      await expect(page.locator('[data-inkling-card-selected="true"]')).not.toBeVisible()
    })
  })

  test.describe('CMD+UP', function () {
    test('with selected card and plain text at top', async function () {
      await focusEditor(page)
      await page.keyboard.type('First')
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await page.keyboard.type('Second')
      await page.keyboard.press('ArrowUp')

      await page.keyboard.press('Meta+ArrowUp')

      await assertSelection(page, {
        anchorPath: [0, 0, 0],
        anchorOffset: 0,
        focusPath: [0, 0, 0],
        focusOffset: 0,
      })
    })

    test('with selected card and card at top', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('---')
      await page.keyboard.press('ArrowUp')

      await page.keyboard.press('Meta+ArrowUp')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p><br /></p>
        `,
      )
    })

    test('with caret in text and card at top', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('First')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Second')

      await page.keyboard.press('Meta+ArrowUp')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
          <p dir="ltr"><span data-lexical-text="true">First</span></p>
          <p dir="ltr"><span data-lexical-text="true">Second</span></p>
        `,
      )
    })
  })

  test.describe('CMD+DOWN', function () {
    test('with selected card and plain text at bottom', async function () {
      await focusEditor(page)
      await page.keyboard.type('First')
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await page.keyboard.type('Second')
      await page.keyboard.press('ArrowUp')

      await page.keyboard.press('Meta+ArrowDown')

      await assertSelection(page, {
        anchorPath: [2, 0, 0],
        anchorOffset: 6,
        focusPath: [2, 0, 0],
        focusOffset: 6,
      })
    })

    test('with selected card and card at bottom', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.keyboard.type('---')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('ArrowUp')

      await page.keyboard.press('Meta+ArrowDown')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
        `,
      )
    })

    test('with caret in text and card at bottom', async function () {
      await focusEditor(page)
      await page.keyboard.type('First')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Second')
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')

      await page.keyboard.press('Meta+ArrowDown')

      await assertHTML(
        page,
        html`
          <p dir="ltr"><span data-lexical-text="true">First</span></p>
          <p dir="ltr"><span data-lexical-text="true">Second</span></p>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="horizontalrule">
              <hr />
            </div>
          </div>
        `,
      )
    })
  })

  test.describe('captions', function () {
    // we had a bug where the caption would steal focus when typing in any
    // other card, resulting in the typed text being inserted into the caption
    test('do not steal focus when not selected', async function () {
      await focusEditor(page)
      await page.keyboard.type('/image https://example.com/image.jpg')
      await page.waitForSelector('[data-inkling-card-menu-item="Image"][data-inkling-cardmenu-selected="true"]')
      await page.keyboard.press('Enter')
      await page.waitForSelector('[data-inkling-card="image"]')
      await page.keyboard.type('Caption value')

      await expect(page.locator('[data-inkling-card="image"] figcaption [data-inkling="editor"]')).toHaveText(
        'Caption value',
      )

      await page.keyboard.press('Meta+Enter')
      await page.keyboard.type('``` ')
      await page.waitForSelector('[data-inkling-card="codeblock"]')
      await expect(page.locator('[data-inkling-card="codeblock"] .cm-editor')).toBeVisible()
      await page.locator('[data-inkling-card="codeblock"] .cm-content').click()
      await page.keyboard.type('Code content')

      await expect(page.locator('[data-inkling-card="image"] figcaption [data-inkling="editor"]')).toHaveText(
        'Caption value',
      )
      await expect(page.locator('[data-inkling-card="codeblock"] .cm-line')).toHaveText('Code content')
    })
  })

  test.describe('inner editors', function () {
    test('can use the delete key to remove text', async function () {
      await focusEditor(page)
      await page.keyboard.type('/image https://example.com/image.jpg')
      await page.waitForSelector('[data-inkling-card-menu-item="Image"][data-inkling-cardmenu-selected="true"]')
      await page.keyboard.press('Enter')
      await page.waitForSelector('[data-inkling-card="image"]')
      await page.keyboard.type('Caption value')
      await page.keyboard.press('ArrowLeft')
      // await page.keyboard.press('Fn+Backspace'); // note: this is the delete key for macs, but playwright doesn't recognize "Fn" even when running on a mac :(
      await page.keyboard.press('Delete')

      await expect(page.locator('[data-inkling-card="image"] figcaption [data-inkling="editor"]')).toHaveText(
        'Caption valu',
      )
    })

    test.describe('codemirror', function () {
      test('can copy/paste', async function () {
        await focusEditor(page)
        await insertCard(page, { cardName: 'html' })

        // waiting for html editor
        await expect(page.locator('.cm-content[contenteditable="true"]')).toBeVisible()

        await page.keyboard.type('Testing', { delay: 10 })
        await page.waitForTimeout(100)
        await page.keyboard.press(`${ctrlOrCmd(page)}+KeyA`)
        await page.waitForTimeout(100)
        await page.keyboard.press(`${ctrlOrCmd(page)}+KeyC`)
        await page.waitForTimeout(100)
        // collapse selection to the end so pastes append instead of replacing
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(100)
        await page.keyboard.press(`${ctrlOrCmd(page)}+KeyV`)
        await page.waitForTimeout(100)
        await page.keyboard.press(`${ctrlOrCmd(page)}+KeyV`)
        await page.waitForTimeout(100)

        await assertHTML(
          page,
          html`
            <div data-lexical-decorator="true" contenteditable="false">
              <div><svg></svg></div>
              <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="html">
                <div>
                  <div>
                    <div>
                      <div aria-live="polite"></div>
                      <div tabindex="-1">
                        <div aria-hidden="true">
                          <div>
                            <div>9</div>
                            <div>1</div>
                          </div>
                        </div>
                        <div
                          spellcheck="false"
                          autocorrect="off"
                          autocapitalize="off"
                          translate="no"
                          contenteditable="true"
                          role="textbox"
                          aria-multiline="true"
                          writingsuggestions="false"
                          data-language="html"
                        >
                          <div>TestingTestingTesting</div>
                        </div>
                        <div aria-hidden="true">
                          <div></div>
                        </div>
                        <div aria-hidden="true"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p><br /></p>
          `,
          { ignoreCardContents: false },
        )
      })
    })

    test('entering edit mode on a card does not scroll when other cards have nested editors', async function () {
      // Build content with a callout card at the top, many paragraphs to
      // create scroll distance, and another callout card at the bottom.
      // Cards are pre-loaded so they haven't been through an edit cycle
      // (their nested editor autoFocus initial state stays true).
      // Before the fix, the global isEditingCard flag caused ALL nested
      // editors with shouldFocus=true to fire their focus effect when any
      // card entered edit mode, causing a scroll jump as the nested editor
      // further down the page transiently grabbed focus.
      const calloutCard = {
        type: 'callout',
        calloutText: '<p><span style="white-space: pre-wrap;">Callout content</span></p>',
        calloutEmoji: '💡',
        backgroundColor: 'blue',
      }

      const children: object[] = [{ ...calloutCard }]

      for (let i = 0; i < 30; i++) {
        children.push({
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: `Line ${i + 1} of filler content to create scroll distance`,
              type: 'text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        })
      }

      children.push({ ...calloutCard })

      const contentParam = encodeURIComponent(
        JSON.stringify({
          root: {
            children,
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        }),
      )

      await initialize({ page, uri: `/#/?content=${contentParam}` })

      // Select the first card (already in viewport at the top)
      const firstCard = page.locator('[data-inkling-card="callout"]').first()
      await firstCard.click()
      await expect(firstCard).toHaveAttribute('data-inkling-card-selected', 'true')

      // Scroll position should be at the top
      const scrollBefore = await getScrollPosition(page)
      expect(scrollBefore).toBe(0)

      // Start monitoring for any scroll movement
      await page.evaluate(() => {
        const container = document.querySelector('.h-full.overflow-auto')
        if (!container) {
          throw new Error('Expected editor scroll container')
        }
        container.setAttribute('data-scroll-start-position', String(container.scrollTop))
        container.setAttribute('data-max-scroll-deviation', '0')
        container.addEventListener('scroll', () => {
          const startPosition = Number(container.getAttribute('data-scroll-start-position'))
          const maxDeviation = Number(container.getAttribute('data-max-scroll-deviation'))
          const deviation = Math.abs(container.scrollTop - startPosition)
          if (deviation > maxDeviation) {
            container.setAttribute('data-max-scroll-deviation', String(deviation))
          }
        })
      })

      // Enter edit mode on the first card — the second card's nested
      // editor is far below the viewport so any transient focus grab
      // would cause a large downward scroll jump
      await firstCard.click()
      await expect(firstCard).toHaveAttribute('data-inkling-card-editing', 'true')

      // Check no scroll movement occurred (even transiently)
      const maxDeviation = await page.evaluate(() => {
        const container = document.querySelector('.h-full.overflow-auto')
        if (!container) {
          throw new Error('Expected editor scroll container')
        }
        return Number(container.getAttribute('data-max-scroll-deviation'))
      })

      expect(maxDeviation).toBe(0)
    })
  })
})
