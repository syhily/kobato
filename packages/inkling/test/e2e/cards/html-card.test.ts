import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  createSnippet,
  ctrlOrCmd,
  focusEditor,
  html,
  initialize,
  loadSerializedState,
  waitForCodeMirrorHistoryGroup,
} from '#/utils/e2e'

test.describe('Html card', () => {
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

  test('can import serialized html card nodes', async function () {
    await loadSerializedState(page, {
      root: {
        children: [
          {
            type: 'html',
            html: '<p>test content</p>',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div><svg></svg></div>
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="html">
            <div>
              <div><p>test content</p></div>
              <div></div>
            </div>
          </div>
        </div>
      `,
      { ignoreCardContents: false },
    )
  })

  test('renders without style elements and attributes', async function () {
    await loadSerializedState(page, {
      root: {
        children: [
          {
            type: 'html',
            html: '<div id="fullscreen"><span style="fullscreen-inner">Loading...</span></div><style>.fullscreen {position: fixed;}</style>',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div><svg></svg></div>
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="html">
            <div>
              <div>
                <div><span style="fullscreen-inner">Loading...</span></div>
              </div>
              <div></div>
            </div>
          </div>
        </div>
      `,
      { ignoreCardContents: false, ignoreInlineStyles: false },
    )
  })

  test('renders html card node from slash entry', async function () {
    await focusEditor(page)
    await page.keyboard.type('/html')
    await page.waitForSelector('[data-inkling-card-menu-item="HTML"][data-inkling-cardmenu-selected="true"]')
    await page.keyboard.press('Enter')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div><svg></svg></div>
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="html"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('can add snippet', async function () {
    await focusEditor(page)
    // insert new card
    await page.keyboard.type('/html')
    await page.waitForSelector('[data-inkling-card-menu-item="HTML"][data-inkling-cardmenu-selected="true"]')
    await page.keyboard.press('Enter')

    // fill card
    await expect(page.locator('[data-inkling-card="html"][data-inkling-card-editing="true"]')).toBeVisible()
    // waiting for html editor
    await expect(page.locator('.cm-content[contenteditable="true"]')).toBeVisible()
    await page.locator('[data-inkling-card="html"]').click()
    await page.keyboard.type('text in html card')
    await expect(page.getByText('text in html card')).toBeVisible()
    await page.keyboard.press('Escape')

    // create snippet
    await createSnippet(page)

    // can insert card from snippet
    await page.keyboard.press('Enter')
    await page.keyboard.type('/snippet')
    await expect(page.locator('[data-inkling-cardmenu-selected="true"]').filter({ hasText: 'snippet' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-inkling-card="html"]')).toHaveCount(2)
  })

  test('can undo/redo content in html editor', async function () {
    await focusEditor(page)
    // insert new card
    await page.keyboard.type('/html')
    await page.waitForSelector('[data-inkling-card-menu-item="HTML"][data-inkling-cardmenu-selected="true"]')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-inkling-card="html"][data-inkling-card-editing="true"]')).toBeVisible()
    // waiting for html editor
    await expect(page.locator('.cm-content[contenteditable="true"]')).toBeVisible()

    await page.keyboard.type('Here are some words', { delay: 20 })
    await expect(page.getByText('Here are some words')).toBeVisible()
    // CodeMirror groups changes within 500ms into a single undo transaction,
    // wait to ensure backspace is a separate undo group from the typing
    await waitForCodeMirrorHistoryGroup(page)
    await page.keyboard.press('Backspace')
    await expect(page.getByText('Here are some word')).toBeVisible()
    await page.keyboard.press(`${ctrlOrCmd(page)}+z`)
    await expect(page.getByText('Here are some words')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Here are some words')).toBeVisible()
  })

  test('goes into display mode when losing focus', async function () {
    await focusEditor(page)
    // insert new card
    await page.keyboard.type('/html')
    await page.waitForSelector('[data-inkling-card-menu-item="HTML"][data-inkling-cardmenu-selected="true"]')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-inkling-card="html"][data-inkling-card-editing="true"]')).toBeVisible()
    // waiting for html editor
    await expect(page.locator('.cm-content[contenteditable="true"]')).toBeVisible()

    await page.keyboard.type('Here are some words')
    await page.getByTestId('post-title').click()
    await page.keyboard.type('post title') // click outside of the editor

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div><svg></svg></div>
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="html">
            <div>
              <div class="min-h-[3.5vh] whitespace-normal">Here are some words</div>
              <div class="absolute inset-0 z-50 mt-0"></div>
            </div>
          </div>
        </div>
        <p><br /></p>
      `,
    )
  })
})
