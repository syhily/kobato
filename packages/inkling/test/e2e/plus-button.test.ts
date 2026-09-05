import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  assertPosition,
  assertSelection,
  focusEditor,
  getBoundingBox,
  html,
  initialize,
  insertCard,
} from '#/utils/e2e'

test.describe('Plus button', () => {
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

  test.describe('with caret', function () {
    test('appears on empty editor', async function () {
      await focusEditor(page)
      await expect(page.locator('[data-inkling-plus-button]')).toBeVisible()
    })

    test('moves when selection moves between empty paragraphs', async function () {
      await focusEditor(page)

      // expect button to be positioned for first paragraph
      const firstPara = page.locator('[data-lexical-editor] > p')
      const firstParaRect = await getBoundingBox(firstPara)
      await assertPosition(page, '[data-inkling-plus-button]', { y: firstParaRect.y }, { threshold: 5 })

      await page.keyboard.press('Enter')

      // expect button to be positioned for second paragraph
      const secondPara = page.locator('[data-lexical-editor] > p:nth-of-type(2)')
      const secondParaRect = await getBoundingBox(secondPara)
      await assertPosition(page, '[data-inkling-plus-button]', { y: secondParaRect.y }, { threshold: 5 })

      await page.keyboard.press('ArrowUp')
      // wait for selection change to be processed and plus button position to update
      await page.waitForTimeout(50)

      // expect button to be positioned for first paragraph
      await assertPosition(page, '[data-inkling-plus-button]', { y: firstParaRect.y }, { threshold: 5 })
    })

    test('disappears when starting to type', async function () {
      await focusEditor(page)
      await expect(page.locator('[data-inkling-plus-button]')).toBeVisible()

      await page.keyboard.type('t')
      await expect(page.locator('[data-inkling-plus-button]')).toHaveCount(0)
    })

    test('does not appear on list sections', async function () {
      await focusEditor(page)
      await page.keyboard.type('- ')

      // sanity checks for expected editor state
      await assertHTML(
        page,
        html`
          <ul>
            <li value="1"><br /></li>
          </ul>
        `,
      )
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0, 0],
        focusOffset: 0,
        focusPath: [0, 0],
      })

      await expect(page.locator('[data-inkling-plus-button]')).toHaveCount(0)
    })

    test('is shown after deleting all paragraph contents', async function () {
      await focusEditor(page)
      await page.keyboard.type('t')

      await expect(page.locator('[data-inkling-plus-button]')).toHaveCount(0)

      await page.keyboard.press('Backspace')
      await page.waitForSelector('p > br', { state: 'attached' })

      await expect(page.locator('[data-inkling-plus-button]')).toBeVisible()
    })
  })

  test.describe('with mouse movement', function () {
    test('appears over blank paragraphs', async function () {
      await expect(page.locator('[data-inkling-plus-button]')).toHaveCount(0)

      const pHandle = page.locator('[data-lexical-editor] > p')
      await pHandle.hover()

      await expect(page.locator('[data-inkling-plus-button]')).toBeVisible()
    })

    test('moves when mouse moves', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')

      const firstPHandle = page.locator('[data-lexical-editor] > p').nth(2)
      const firstPHandleBox = await getBoundingBox(firstPHandle)
      await firstPHandle.hover()

      await assertPosition(page, '[data-inkling-plus-button]', { y: firstPHandleBox.y }, { threshold: 5 })

      const secondPHandle = page.locator('[data-lexical-editor] > p:nth-of-type(2)')
      const secondPHandleBox = await getBoundingBox(secondPHandle)
      await secondPHandle.hover()

      await assertPosition(page, '[data-inkling-plus-button]', { y: secondPHandleBox.y }, { threshold: 5 })
    })

    test('does not appear over populated paragraphs', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.type('Testing')

      await expect(page.locator('[data-inkling-plus-button]')).toHaveCount(0)

      const firstPHandle = page.locator('[data-lexical-editor] > p').nth(0)
      await firstPHandle.hover()

      await expect(page.locator('[data-inkling-plus-button]')).toBeVisible()

      const secondPHandle = page.locator('[data-lexical-editor] > p:nth-of-type(2)')
      await secondPHandle.hover()

      await expect(page.locator('[data-inkling-plus-button]')).toHaveCount(0)
    })

    test('does not appear over list sections', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')

      await expect(page.locator('[data-inkling-plus-button]')).toBeVisible()

      await page.keyboard.type('- ')

      await expect(page.locator('[data-inkling-plus-button]')).toHaveCount(0)

      const pHandle = page.locator('[data-lexical-editor] > p')
      await pHandle.hover()

      await expect(page.locator('[data-inkling-plus-button]')).toBeVisible()

      const listHandle = page.locator('[data-lexical-editor] li')
      await listHandle.hover()

      await expect(page.locator('[data-inkling-plus-button]')).toHaveCount(0)
    })

    test('disappears from hovered p when typing on focused p', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')

      const firstPHandle = page.locator('[data-lexical-editor] > p').nth(0)
      await firstPHandle.hover()

      await expect(page.locator('[data-inkling-plus-button]')).toBeVisible()

      await page.keyboard.type('T')

      await expect(page.locator('[data-inkling-plus-button]')).toHaveCount(0)
    })

    test('returns to caret position when over non-empty element', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.type('Testing')
      await page.keyboard.press('Enter')

      const pHandle1 = page.locator('[data-lexical-editor] > p:nth-of-type(1)')
      const pHandle2 = page.locator('[data-lexical-editor] > p:nth-of-type(2)')
      const pHandle3 = page.locator('[data-lexical-editor] > p:nth-of-type(3)')

      const pHandle1Box = await getBoundingBox(pHandle1)
      const pHandle3Box = await getBoundingBox(pHandle3)

      await assertPosition(page, '[data-inkling-plus-button]', { y: pHandle3Box.y }, { threshold: 5 })

      await pHandle1.hover()

      await assertPosition(page, '[data-inkling-plus-button]', { y: pHandle1Box.y }, { threshold: 5 })

      await pHandle2.hover()

      await assertPosition(page, '[data-inkling-plus-button]', { y: pHandle3Box.y }, { threshold: 5 })
    })

    test('does not appear over an empty paragraph in a card', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'callout' })

      await expect(page.locator('[data-inkling-plus-button]')).not.toBeVisible()

      await page.locator('[data-inkling-card="callout"] [data-lexical-editor] p').hover()

      await expect(page.locator('[data-inkling-plus-button]')).not.toBeVisible()
    })
  })

  test.describe('menu', function () {
    test('opens on button click', async function () {
      await focusEditor(page)
      await expect(page.locator('[data-inkling-plus-menu]')).toHaveCount(0)
      await page.click('[data-inkling-plus-button]')
      await expect(page.locator('[data-inkling-plus-menu]')).toBeVisible()
    })

    test('closes on click outside', async function () {
      await focusEditor(page)
      await page.click('[data-inkling-plus-button]')
      await expect(page.locator('[data-inkling-plus-menu]')).toBeVisible()
      await page.click('.inkling-lexical')
      await expect(page.locator('[data-inkling-plus-menu]')).toHaveCount(0)
    })

    test('does not close on click inside', async function () {
      await focusEditor(page)
      await page.click('[data-inkling-plus-button]')
      await page.click('[data-inkling-plus-menu] [role="separator"] > span')
      await expect(page.locator('[data-inkling-plus-menu]')).toBeVisible()
    })

    test('closes on escape', async function () {
      await focusEditor(page)
      await page.click('[data-inkling-plus-button]')
      await expect(page.locator('[data-inkling-plus-menu]')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-inkling-plus-menu]')).toHaveCount(0)
    })

    test('does not move on empty p mouseover when open', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')

      const p1 = page.locator('[data-lexical-editor] > p:nth-of-type(1)')
      const p3 = page.locator('[data-lexical-editor] > p:nth-of-type(3)')
      const p3Box = await getBoundingBox(p3)

      await assertPosition(page, '[data-inkling-plus-button]', { y: p3Box.y }, { threshold: 5 })

      await page.click('[data-inkling-plus-button]')

      // menu opens asynchronously after the click
      await page.waitForSelector('[data-inkling-plus-menu]')

      await expect(page.locator('[data-inkling-plus-menu]')).toBeVisible()
      await assertPosition(page, '[data-inkling-plus-menu]', { y: p3Box.y }, { threshold: 5 })

      await p1.hover()

      await assertPosition(page, '[data-inkling-plus-button]', { y: p3Box.y }, { threshold: 5 })
      await assertPosition(page, '[data-inkling-plus-menu]', { y: p3Box.y }, { threshold: 5 })
    })

    test('moves cursor when opening', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1],
        focusOffset: 0,
        focusPath: [1],
      })

      const p1 = page.locator('[data-lexical-editor] > p:nth-of-type(1)')
      await p1.hover()
      await page.click('[data-inkling-plus-button]')

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0],
        focusOffset: 0,
        focusPath: [0],
      })
    })

    test('closes when typing', async function () {
      await focusEditor(page)
      await page.click('[data-inkling-plus-button]')
      await expect(page.locator('[data-inkling-plus-menu]')).toBeVisible()

      await page.keyboard.type('Test')
      await expect(page.locator('[data-inkling-plus-menu]')).toHaveCount(0)
      expect(
        await page.$eval('[data-lexical-editor] > p', (element) => {
          if (!(element instanceof HTMLElement)) {
            throw new Error('Expected a paragraph element')
          }

          return element.innerText
        }),
      ).toBe('Test')
    })

    test('closes and moves focus on up/down', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.click('[data-inkling-plus-button]')
      await expect(page.locator('[data-inkling-plus-menu]')).toBeVisible()

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1],
        focusOffset: 0,
        focusPath: [1],
      })

      await page.keyboard.press('ArrowUp')
      // Wait for plus button to reposition after cursor move
      await page.waitForTimeout(50)

      await expect(page.locator('[data-inkling-plus-menu]')).toHaveCount(0)
      await expect(page.locator('[data-inkling-plus-button]')).toBeVisible()

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0],
        focusOffset: 0,
        focusPath: [0],
      })

      const p1 = page.locator('[data-lexical-editor] > p').first()
      const p1Box = await getBoundingBox(p1)
      await assertPosition(page, '[data-inkling-plus-button]', { y: p1Box.y }, { threshold: 5 })
    })

    test('inserts card and closes menu when card item clicked', async function () {
      await focusEditor(page)
      await page.click('[data-inkling-plus-button]')
      await page.click('[data-inkling-card-menu-item="Divider"]')

      await expect(page.locator('[data-inkling-plus-menu]')).toHaveCount(0)

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

    test('deselects a selected card when plus button is clicked', async function () {
      await focusEditor(page)
      await page.keyboard.type('---')
      await page.click('[data-inkling-card="horizontalrule"]')

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

      const pHandle = page.locator('[data-lexical-editor] > p').nth(0)
      await pHandle.hover()
      await page.click('[data-inkling-plus-button]')

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

    test("exits a card's edit mode when plus button is clicked", async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.type('``` ')
      await page.waitForSelector('[data-inkling-card="codeblock"] .cm-editor')
      await page.keyboard.type('# Test')

      const pHandle = page.locator('[data-lexical-editor] > p').nth(0)
      await pHandle.hover()
      await page.click('[data-inkling-plus-button]')
      await page.waitForTimeout(200)
      await expect(page.locator('[data-inkling-card="codeblock"]')).toBeVisible()

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
    })
  })
})
