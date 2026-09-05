import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  dragMouse,
  fixture,
  focusEditor,
  getBoundingBox,
  html,
  initialize,
  insertCard,
  type BoundingBox,
} from '#/utils/e2e'

test.describe('Drag Drop Reorder Plugin', function () {
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

  test('can drag and drop a card between two other nodes', async function () {
    const filePath = fixture('large-image.png')

    await focusEditor(page)

    await page.keyboard.type('/image')
    await page.waitForSelector('[data-inkling-card-menu-item="Image"][data-inkling-cardmenu-selected="true"]')

    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
    await fileChooser.setFiles([filePath])

    await page.waitForSelector('[data-inkling-card="image"] [data-testid="image-card-populated"]')
    await page.keyboard.press('ArrowDown')

    await insertDivider(page)

    await page.keyboard.type('This is some text')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="image"></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="false"
            data-inkling-card="horizontalrule"
          ></div>
        </div>
        <p dir="ltr"><span data-lexical-text="true">This is some text</span></p>
      `,
      { ignoreCardContents: true },
    )

    const imageBBox = await getBoundingBox(page.locator('[data-inkling-card="image"]'))
    // :not(figure p) avoids the p element that is the nested editor for the image card caption
    const paragraphBBox = await getBoundingBox(page.locator('p:not(figure p)'))

    await dragMouse(page, imageBBox, paragraphBBox, 'start', 'start', true, 100, 100)

    // Click on the paragraph to deselect the card after drop
    // (Chrome for Testing keeps the card selected after drag & drop unlike old Chromium)
    await page.click('p:not(figure p)')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="false"
            data-inkling-card="horizontalrule"
          ></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="image"></div>
        </div>
        <p dir="ltr"><span data-lexical-text="true">This is some text</span></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('can drag and drop a card at the top of the editor', async function () {
    const filePath = fixture('large-image.png')

    await focusEditor(page)

    await insertDivider(page)

    await page.keyboard.type('This is some text')
    await page.keyboard.press('Enter')

    await page.keyboard.type('/image')
    await page.waitForSelector('[data-inkling-card-menu-item="Image"][data-inkling-cardmenu-selected="true"]')

    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
    await fileChooser.setFiles([filePath])

    await page.waitForSelector('[data-inkling-card="image"] [data-testid="image-card-populated"]')
    await page.keyboard.press('ArrowDown')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="false"
            data-inkling-card="horizontalrule"
          ></div>
        </div>
        <p dir="ltr"><span data-lexical-text="true">This is some text</span></p>
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="image"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )

    const imageBBox = await getBoundingBox(page.locator('[data-inkling-card="image"]'))
    const dividerBBox = await getBoundingBox(page.locator('hr'))

    await dragMouse(page, imageBBox, dividerBBox, 'start', 'start', true, 100, 100)

    // Click on the paragraph to deselect the card after drop
    // (Chrome for Testing keeps the card selected after drag & drop unlike old Chromium)
    await page.click('p:not(figure p)')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="image"></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="false"
            data-inkling-card="horizontalrule"
          ></div>
        </div>
        <p dir="ltr"><span data-lexical-text="true">This is some text</span></p>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('can drag and drop a card at the bottom of the editor', async function () {
    const filePath = fixture('large-image.png')

    await focusEditor(page)

    await page.keyboard.type('/image')
    await page.waitForSelector('[data-inkling-card-menu-item="Image"][data-inkling-cardmenu-selected="true"]')

    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
    await fileChooser.setFiles([filePath])

    await page.waitForSelector('[data-inkling-card="image"] [data-testid="image-card-populated"]')
    await page.keyboard.press('ArrowDown')

    await insertDivider(page)

    await page.keyboard.type('This is some text', { delay: 100 }) // type slower to imitate user
    await expect(page.getByText('This is some text')).toBeVisible()

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="image"></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="false"
            data-inkling-card="horizontalrule"
          ></div>
        </div>
        <p dir="ltr"><span data-lexical-text="true">This is some text</span></p>
      `,
      { ignoreCardContents: true },
    )

    const imageBBox = await getBoundingBox(page.locator('[data-inkling-card="image"]'))

    await twoPhaseDragToBottom(page, imageBBox)
    await page.waitForTimeout(100)
    await page.mouse.up()

    // Click on the paragraph to deselect the card after drop
    // (Chrome for Testing keeps the card selected after drag & drop unlike old Chromium)
    await page.click('p:not(figure p)')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="false"
            data-inkling-card="horizontalrule"
          ></div>
        </div>
        <p dir="ltr"><span data-lexical-text="true">This is some text</span></p>
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="image"></div>
        </div>
      `,
      { ignoreCardContents: true },
    )
  })

  test('can display placeholder element while hovering between nodes', async function () {
    const filePath = fixture('large-image.png')

    await focusEditor(page)

    await page.keyboard.type('/image')
    await page.waitForSelector('[data-inkling-card-menu-item="Image"][data-inkling-cardmenu-selected="true"]')

    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
    await fileChooser.setFiles([filePath])

    await page.waitForSelector('[data-inkling-card="image"] [data-testid="image-card-populated"]')
    await page.keyboard.press('ArrowDown')

    await insertDivider(page)

    await page.keyboard.type('This is some text')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="image"></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="false"
            data-inkling-card="horizontalrule"
          ></div>
        </div>
        <p dir="ltr"><span data-lexical-text="true">This is some text</span></p>
      `,
      { ignoreCardContents: true },
    )

    const imageBBox = await getBoundingBox(page.locator('[data-inkling-card="image"]'))

    await twoPhaseDragToBottom(page, imageBBox)

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="image"></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="false"
            data-inkling-card="horizontalrule"
          ></div>
        </div>
        <p dir="ltr"><span data-lexical-text="true">This is some text</span></p>
      `,
      { ignoreCardContents: true },
    )

    const indicator = page.locator('[data-inkling-drag-drop-indicator]')
    await expect(indicator).toBeVisible()

    // Release the mouse to clean up drag state
    await page.mouse.up()
  })
})

async function insertDivider(page: Page) {
  await insertCard(page, { cardName: 'divider' })
}

// Two-phase drag: move partway first, wait for caption and CSS transitions
// to settle, then measure paragraph's actual position and move into its
// bottom half. A single fast drag races against the 250ms CSS transition
// that shifts the paragraph during drag. Leaves the mouse held down so
// the caller can mouse.up() (for drop tests) or assert mid-drag state.
async function twoPhaseDragToBottom(page: Page, imageBBox: BoundingBox) {
  await page.mouse.move(imageBBox.x, imageBBox.y)
  await page.mouse.down()

  // Move past the HR card to trigger the drop indicator and transforms
  const hrBBox = await getBoundingBox(page.locator('hr'))
  await page.mouse.move(imageBBox.x, hrBBox.y + hrBBox.height, { steps: 50 })

  // Wait for caption appearance and CSS transitions to settle
  await page.waitForTimeout(300)

  // Measure paragraph's actual visual position (includes caption shift + transform)
  // :not(figure p) avoids the p element that is the nested editor for the image card caption
  const shiftedParagraphBBox = await getBoundingBox(page.locator('p:not(figure p)'))
  const targetY = shiftedParagraphBBox.y + shiftedParagraphBBox.height * 0.75
  await page.mouse.move(imageBBox.x, targetY, { steps: 10 })
}
