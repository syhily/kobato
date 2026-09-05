import { expect, test, type Page } from '@playwright/test'

import { assertHTML, assertSelection, focusEditor, html, initialize, insertCard } from '#/utils/e2e'

test.describe('Slash menu', () => {
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

  test.describe('open/close', function () {
    test('opens with / on blank paragraph', async function () {
      await focusEditor(page)
      await expect(page.locator('[data-inkling-slash-menu]')).not.toBeVisible()
      await page.keyboard.type('/')
      await expect(page.locator('[data-inkling-slash-menu]')).toBeVisible()
    })

    test('opens with / on paragraph that is entirely selected', async function () {
      await focusEditor(page)
      await page.keyboard.type('testing')

      const paragraph = page.locator('[data-lexical-editor] > p')
      await paragraph.click({ clickCount: 3 })

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0, 0, 0],
        focusOffset: 7,
        focusPath: [0, 0, 0],
      })

      await page.keyboard.type('/')

      // sanity check that text was fully selected + replaced
      await assertHTML(page, html`<p dir="auto"><span data-lexical-text="true">/</span></p>`)

      await expect(page.locator('[data-inkling-slash-menu]')).toBeVisible()
    })

    test('opens with / + SHIFT', async function () {
      await focusEditor(page)
      await page.keyboard.down('Shift')
      await page.keyboard.type('/')
      await page.keyboard.up('Shift')
      await expect(page.locator('[data-inkling-slash-menu]')).toBeVisible()
    })

    test('does not open with / on populated paragraph', async function () {
      await focusEditor(page)
      await page.keyboard.type('testing')
      await page.keyboard.type('/')

      await expect(page.locator('[data-inkling-slash-menu]')).not.toBeVisible()

      await page.keyboard.press('Backspace')
      for (let i = 0; i < 'testing'.length; i++) {
        await page.keyboard.press('ArrowLeft')
      }

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [0, 0, 0],
        focusOffset: 0,
        focusPath: [0, 0, 0],
      })

      await page.keyboard.type('/')

      await expect(page.locator('[data-inkling-slash-menu]')).not.toBeVisible()
    })

    test('closes when / deleted', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')

      await expect(page.locator('[data-inkling-slash-menu]')).toBeVisible()

      await page.keyboard.press('Backspace')

      await expect(page.locator('[data-inkling-slash-menu]')).not.toBeVisible()
    })

    test('closes on Escape', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')
      await page.keyboard.press('Escape')

      await expect(page.locator('[data-inkling-slash-menu]')).not.toBeVisible()

      await assertSelection(page, {
        anchorOffset: 1,
        anchorPath: [0, 0, 0],
        focusOffset: 1,
        focusPath: [0, 0, 0],
      })
    })

    test('closes on click outside menu', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')
      await page.click('body', { position: { x: 10, y: 10 } })

      await expect(page.locator('[data-inkling-slash-menu]')).not.toBeVisible()
    })

    test('does not close on click inside menu', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')
      await page.click('[data-inkling-slash-menu] [role="separator"] > span') // better selector for menu headings?

      await expect(page.locator('[data-inkling-slash-menu]')).toBeVisible()
    })

    test('does not re-open when cursor placed back on /', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.type('/')
      await page.click('body', { position: { x: 10, y: 10 } })
      await page.click('[data-lexical-editor] > p:nth-of-type(2)')

      await expect(page.locator('[data-inkling-slash-menu]')).not.toBeVisible()

      // TODO: this fails in CI but passes locally
      // await assertSelection(page, {
      //     anchorOffset: 1,
      //     anchorPath: [1, 0, 0],
      //     focusOffset: 1,
      //     focusPath: [1, 0, 0]
      // });

      // Temp workaround for above to ensure the focus is in the right place
      await page.keyboard.type('words')
      await assertHTML(
        page,
        html`
          <p dir="auto"><br data-lexical-managed-linebreak="true" /></p>
          <p dir="auto"><span data-lexical-text="true">/words</span></p>
        `,
      )
    })
  })

  test.describe('filtering', function () {
    test('matches text after /', async function () {
      await focusEditor(page)
      await page.keyboard.type('/img')

      const menuItems = page.locator('[data-inkling-slash-menu] [role="menuitem"]')
      await expect(menuItems).toHaveCount(1)

      await expect(menuItems.first()).toContainText('Image')
    })

    test('shows no menu with no matches', async function () {
      await focusEditor(page)
      await page.keyboard.type('/unknown')

      await expect(page.locator('[data-inkling-slash-menu]')).not.toBeVisible()
    })
  })

  test.describe('selection', function () {
    test('first item is selected when opening', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')

      const menuItems = page.locator('[data-inkling-slash-menu] [role="menuitem"]')
      await expect(menuItems.nth(0)).toHaveAttribute('data-inkling-cardmenu-selected', 'true')
      await expect(menuItems.nth(1)).toHaveAttribute('data-inkling-cardmenu-selected', 'false')
    })

    test('DOWN selects next item', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')
      await page.keyboard.press('ArrowDown')

      const menuItems = page.locator('[data-inkling-slash-menu] [role="menuitem"]')
      await expect(menuItems.nth(0)).toHaveAttribute('data-inkling-cardmenu-selected', 'false')
      await expect(menuItems.nth(1)).toHaveAttribute('data-inkling-cardmenu-selected', 'true')
    })

    test('RIGHT selects next item', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')
      await page.keyboard.press('ArrowRight')

      const menuItems = page.locator('[data-inkling-slash-menu] [role="menuitem"]')
      await expect(menuItems.nth(0)).toHaveAttribute('data-inkling-cardmenu-selected', 'false')
      await expect(menuItems.nth(1)).toHaveAttribute('data-inkling-cardmenu-selected', 'true')
    })

    test('UP selects previous item', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowUp')

      const menuItems = page.locator('[data-inkling-slash-menu] [role="menuitem"]')
      await expect(menuItems.nth(0)).toHaveAttribute('data-inkling-cardmenu-selected', 'true')
      await expect(menuItems.nth(1)).toHaveAttribute('data-inkling-cardmenu-selected', 'false')
    })

    test('LEFT selects previous item', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowLeft')

      const menuItems = page.locator('[data-inkling-slash-menu] [role="menuitem"]')
      await expect(menuItems.nth(0)).toHaveAttribute('data-inkling-cardmenu-selected', 'true')
      await expect(menuItems.nth(1)).toHaveAttribute('data-inkling-cardmenu-selected', 'false')
    })

    test('first item is selected after changing query', async function () {
      await focusEditor(page)
      await page.keyboard.type('/')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.type('hr')

      const menuItems = page.locator('[data-inkling-slash-menu] [role="menuitem"]')
      await expect(menuItems.nth(0)).toHaveAttribute('data-inkling-cardmenu-selected', 'true')
    })
  })

  test.describe('insertion', function () {
    test('ENTER inserts card', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'divider' })

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
          <p dir="auto"><br data-lexical-managed-linebreak="true" /></p>
        `,
      )

      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [1],
        focusOffset: 0,
        focusPath: [1],
      })

      await expect(page.locator('[data-inkling-slash-menu]')).not.toBeVisible()
    })

    test('has correct order when inserting after text', async function () {
      await focusEditor(page)
      await page.keyboard.type('Testing')
      await page.keyboard.press('Enter')
      await insertCard(page, { cardName: 'divider' })

      await assertHTML(
        page,
        html`
          <p dir="auto"><span data-lexical-text="true">Testing</span></p>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            >
              <hr />
            </div>
          </div>
          <p dir="auto"><br data-lexical-managed-linebreak="true" /></p>
        `,
      )

      // HR card puts focus on paragraph after insert
      await assertSelection(page, {
        anchorOffset: 0,
        anchorPath: [2],
        focusOffset: 0,
        focusPath: [2],
      })
    })

    test('has correct order when inserting after a card', async function () {
      await focusEditor(page)
      await page.keyboard.type('/hr')
      await page.waitForSelector('li:first-child > [data-inkling-card-menu-item="Divider"]')
      await page.keyboard.press('Enter')
      await page.keyboard.type('/img')
      await page.waitForSelector('li:first-child > [data-inkling-card-menu-item="Image"]')
      await page.keyboard.press('Enter')

      // image card retains focus after insert
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
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="image"></div>
          </div>
          <p dir="auto"><br data-lexical-managed-linebreak="true" /></p>
        `,
        { ignoreCardContents: true },
      )
    })

    test('uses query params', async function () {
      await focusEditor(page)
      await page.keyboard.type('/image https://example.com/image.jpg')
      await expect(
        page.locator('[data-inkling-card-menu-item="Image"][data-inkling-cardmenu-selected="true"]'),
      ).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(page.locator('[data-inkling-card="image"]')).toBeVisible()

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="image"></div>
          </div>
          <p dir="auto"><br data-lexical-managed-linebreak="true" /></p>
        `,
        { ignoreCardContents: true },
      )

      expect(
        await page.evaluate(() => {
          const image = document.querySelector('[data-inkling-card="image"] img')
          if (!(image instanceof HTMLImageElement)) {
            throw new Error('Expected an image card image')
          }

          return image.src
        }),
      ).toEqual('https://example.com/image.jpg')
    })

    test('can insert card at beginning of document before text', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      // todo: flaky test, added delay for slower typing to imitate user behaviour
      // need to add retry instead of delay after migration to playwright if the problem persists
      await page.keyboard.type('Testing', { delay: 100 })
      await page.keyboard.press('ArrowUp', { delay: 100 })
      await insertCard(page, { cardName: 'callout' })

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="callout"></div>
          </div>
          <p dir="auto"><span data-lexical-text="true">Testing</span></p>
        `,
        { ignoreCardContents: true },
      )
    })

    test('can insert card at beginning of document before card', async function () {
      await focusEditor(page)
      await page.keyboard.press('Enter')
      await page.keyboard.type('---')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
      await insertCard(page, { cardName: 'callout' })

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="callout"></div>
          </div>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            ></div>
          </div>
          <p dir="auto"><br data-lexical-managed-linebreak="true" /></p>
        `,
        { ignoreCardContents: true },
      )
    })
  })
})
