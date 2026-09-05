import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  ctrlOrCmd,
  fixture,
  focusEditor,
  html,
  initialize,
  insertCard,
  insertCardWithUpload,
  selectBackwards,
} from '#/utils/e2e'

test.describe('Floating format toolbar', () => {
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

  test('appears on text selection', async function () {
    await focusEditor(page)
    await page.keyboard.type('text for selection')

    await expect(page.locator('[data-inkling-floating-toolbar]')).toHaveCount(0)

    await selectBackwards(page, 'for selection'.length)

    await expect(page.locator('[data-inkling-floating-toolbar]')).toBeVisible()
  })

  test('appears on paragraph selection', async function () {
    await focusEditor(page)
    await expect(page.locator('[data-inkling-floating-toolbar]')).toHaveCount(0)
    await test.step('Insert paragraphs', async () => {
      await page.keyboard.type('paragraph for selection')
      await page.keyboard.press('Shift+Enter')
      await page.keyboard.type('paragraph for selection')
      await page.keyboard.press('Shift+Enter')
      await page.keyboard.type('paragraph for selection')
    })

    await test.step('Move cursor to the end of first paragraph', async () => {
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
    })

    await test.step('Select paragraphs', async () => {
      await page.keyboard.down('Shift')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.up('Shift')
    })

    await expect(page.locator('[data-inkling-floating-toolbar]')).toBeVisible()
  })

  test('disappears on selection removal', async function () {
    await focusEditor(page)
    await page.keyboard.type('text for selection')
    await selectBackwards(page, 1)

    await expect(page.locator('[data-inkling-floating-toolbar]')).toBeVisible()

    await page.keyboard.press('ArrowRight')

    await expect(page.locator('[data-inkling-floating-toolbar]')).toHaveCount(0)
  })

  test.describe('buttons', function () {
    const BASIC_TOGGLES = [
      {
        button: 'bold',
        html: html`
          <p dir="ltr">
            <span data-lexical-text="true">text for </span>
            <strong data-lexical-text="true">selection</strong>
          </p>
        `,
      },
      {
        button: 'italic',
        html: html`
          <p dir="ltr">
            <span data-lexical-text="true">text for </span>
            <em class="italic" data-lexical-text="true">selection</em>
          </p>
        `,
      },
      {
        button: 'h2',
        html: html` <h2 dir="ltr"><span data-lexical-text="true">text for selection</span></h2> `,
      },
      {
        button: 'h3',
        html: html` <h3 dir="ltr"><span data-lexical-text="true">text for selection</span></h3> `,
      },
    ]

    BASIC_TOGGLES.forEach((testCase) => {
      test(`toggles ${testCase.button}`, async function () {
        await focusEditor(page)
        await page.keyboard.type('text for selection')

        await assertHTML(page, html`<p dir="ltr"><span data-lexical-text="true">text for selection</span></p>`)

        await selectBackwards(page, 'selection'.length)

        const buttonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="${testCase.button}"] button`
        await page.click(buttonSelector)

        await assertHTML(page, testCase.html)

        expect(await page.$eval(buttonSelector, (e) => e.dataset.inklingActive)).toEqual('true')

        await page.click(buttonSelector)

        await assertHTML(page, html`<p dir="ltr"><span data-lexical-text="true">text for selection</span></p>`)
        expect(await page.$eval(buttonSelector, (e) => e.dataset.inklingActive)).toEqual('false')
      })
    })

    test('toggles h4 to h2', async function () {
      await focusEditor(page)
      await page.keyboard.type('#### header for selection')

      await assertHTML(page, html`<h4 dir="ltr"><span data-lexical-text="true">header for selection</span></h4>`)

      await selectBackwards(page, 'selection'.length)

      const buttonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="h2"] button`
      await page.click(buttonSelector)

      await assertHTML(page, html` <h2 dir="ltr"><span data-lexical-text="true">header for selection</span></h2> `)

      expect(await page.$eval(buttonSelector, (e) => e.dataset.inklingActive)).toEqual('true')

      await page.click(buttonSelector)

      await assertHTML(page, html`<p dir="ltr"><span data-lexical-text="true">header for selection</span></p>`)
      expect(await page.$eval(buttonSelector, (e) => e.dataset.inklingActive)).toEqual('false')
    })

    test('toggles h4 to h3', async function () {
      await focusEditor(page)
      await page.keyboard.type('#### header for selection')

      await assertHTML(page, html`<h4 dir="ltr"><span data-lexical-text="true">header for selection</span></h4>`)

      await selectBackwards(page, 'selection'.length)

      const buttonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="h3"] button`
      await page.click(buttonSelector)

      await assertHTML(page, html` <h3 dir="ltr"><span data-lexical-text="true">header for selection</span></h3> `)

      expect(await page.$eval(buttonSelector, (e) => e.dataset.inklingActive)).toEqual('true')

      await page.click(buttonSelector)

      await assertHTML(page, html`<p dir="ltr"><span data-lexical-text="true">header for selection</span></p>`)
      expect(await page.$eval(buttonSelector, (e) => e.dataset.inklingActive)).toEqual('false')
    })

    test('cycles through quote styles', async function () {
      await focusEditor(page)
      await page.keyboard.type('quote text')

      await selectBackwards(page, 1)

      const buttonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="quote"] button`
      await page.click(buttonSelector)

      await assertHTML(
        page,
        html`
          <blockquote dir="ltr">
            <span data-lexical-text="true">quote text</span>
          </blockquote>
        `,
      )
      expect(await page.$eval(buttonSelector, (e) => e.dataset.inklingActive)).toEqual('true')

      await page.click(buttonSelector)

      await assertHTML(
        page,
        html`
          <aside dir="ltr">
            <span data-lexical-text="true">quote text</span>
          </aside>
        `,
      )
      expect(await page.$eval(buttonSelector, (e) => e.dataset.inklingActive)).toEqual('true')

      await page.click(buttonSelector)

      await assertHTML(page, html`<p dir="ltr"><span data-lexical-text="true">quote text</span></p>`)
      expect(await page.$eval(buttonSelector, (e) => e.dataset.inklingActive)).toEqual('false')
    })

    test('can create link (with search)', async function () {
      await focusEditor(page)
      await page.keyboard.type('link')

      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <span data-lexical-text="true">link</span>
          </p>
        `,
      )

      await selectBackwards(page, 4)

      const buttonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="link"] button`

      // Add the link
      await page.click(buttonSelector)
      await expect(page.getByTestId('link-input')).toBeVisible()
      await expect(page.getByTestId('link-input')).toBeFocused()
      await page.keyboard.type('https://inkling.local/', { delay: 10 })
      await page.keyboard.press('Enter')
      await expect(page.locator('[data-inkling-floating-toolbar]')).not.toBeVisible()

      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <a href="https://inkling.local/" rel="noreferrer" dir="ltr">
              <span data-lexical-text="true">link</span>
            </a>
          </p>
        `,
      )

      // TODO: assert link is not selected

      // Edit the link
      await selectBackwards(page, 4)
      await page.click(buttonSelector)
      await expect(page.getByTestId('link-input')).toHaveValue('https://inkling.local/')
    })

    test('can create link (without search)', async function () {
      await initialize({ page, uri: '/#/?content=false&searchLinks=false' })
      await focusEditor(page)
      await page.keyboard.type('link')

      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <span data-lexical-text="true">link</span>
          </p>
        `,
      )

      await selectBackwards(page, 4)

      const buttonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="link"] button`
      await page.click(buttonSelector)
      await page.waitForSelector('[data-testid="link-input"]')
      await page.getByTestId('link-input').fill('https://inkling.local/')
      await page.keyboard.press('Enter')

      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <a href="https://inkling.local/" rel="noreferrer" dir="ltr">
              <span data-lexical-text="true">link</span>
            </a>
          </p>
        `,
      )

      await selectBackwards(page, 4)
      await page.click(buttonSelector)
      await page.waitForSelector('[data-testid="link-input"]')
      await page.getByTestId('link-input').fill('')
      await page.keyboard.press('Enter')

      await assertHTML(page, html` <p dir="ltr"><span data-lexical-text="true">link</span></p> `)
    })
  })

  test.describe('with cards', function () {
    test('toggles all text when text+hr cards are selected', async function () {
      await focusEditor(page)
      await page.keyboard.type('First paragraph')
      await page.keyboard.press('Enter')
      await insertCard(page, { cardName: 'divider' })
      await page.keyboard.type('Second paragraph')
      await page.keyboard.press(`${ctrlOrCmd(page)}+A`)

      const buttonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="h2"] button`
      await page.click(buttonSelector)

      await assertHTML(
        page,
        html`
          <h2 dir="ltr"><span data-lexical-text="true">First paragraph</span></h2>
          <div data-lexical-decorator="true" contenteditable="false">
            <div
              data-inkling-card-editing="false"
              data-inkling-card-selected="false"
              data-inkling-card="horizontalrule"
            ></div>
          </div>
          <h2 dir="ltr"><span data-lexical-text="true">Second paragraph</span></h2>
        `,
        { ignoreCardContents: true },
      )
    })

    test('toggles all text when text+image cards are selected', async function () {
      const filePath = fixture('large-image.png')

      await focusEditor(page)
      await page.keyboard.type('First paragraph')
      await page.keyboard.press('Enter')

      await insertCardWithUpload(page, { cardName: 'image', files: filePath })

      await expect(page.getByTestId('image-card-populated')).toBeVisible()

      await page.keyboard.press('ArrowDown')
      await page.keyboard.type('Second paragraph')
      await page.keyboard.press(`${ctrlOrCmd(page)}+A`)

      const buttonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="h2"] button`
      await page.click(buttonSelector)

      await assertHTML(
        page,
        html`
          <h2 dir="ltr"><span data-lexical-text="true">First paragraph</span></h2>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="image"></div>
          </div>
          <h2 dir="ltr"><span data-lexical-text="true">Second paragraph</span></h2>
        `,
        { ignoreCardContents: true },
      )
    })

    test('toggles all text when text+audio cards are selected', async function () {
      const filePath = fixture('large-image.png')

      await focusEditor(page)
      await page.keyboard.type('First paragraph')
      await page.keyboard.press('Enter')

      await insertCardWithUpload(page, { cardName: 'audio', files: filePath })

      await page.keyboard.press('ArrowDown')
      await page.keyboard.type('Second paragraph')
      await page.keyboard.press(`${ctrlOrCmd(page)}+A`)

      const buttonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="h2"] button`
      await page.click(buttonSelector)

      await assertHTML(
        page,
        html`
          <h2 dir="ltr"><span data-lexical-text="true">First paragraph</span></h2>
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="audio"></div>
          </div>
          <h2 dir="ltr"><span data-lexical-text="true">Second paragraph</span></h2>
        `,
        { ignoreCardContents: true },
      )
    })
  })
})
