import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  ctrlOrCmd,
  focusEditor,
  html,
  initialize,
  pasteText,
  selectBackwards,
  waitForCardContentSynced,
  waitForHistoryGroupBoundary,
} from '#/utils/e2e'

test.describe('Code Block card', () => {
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

  test('can import serialized code block card nodes', async function () {
    const contentParam = encodeURIComponent(
      JSON.stringify({
        root: {
          children: [
            {
              type: 'codeblock',
              code: '<script></script>',
              language: 'javascript',
              caption: 'A code block',
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
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="codeblock">
            <div>
              <pre><code>&lt;script&gt;&lt;/script&gt;</code></pre>
              <div><span>javascript</span></div>
            </div>
            <figcaption>
              <div data-inkling-allow-clickthrough="true">
                <div>
                  <div data-inkling="editor">
                    <div contenteditable="true" role="textbox" spellcheck="true" data-lexical-editor="true">
                      <p dir="ltr">
                        <span data-lexical-text="true">A code block</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </figcaption>
          </div>
        </div>
      `,
      { ignoreCardContents: false },
    )
  })

  test.describe('shortcuts', () => {
    test('renders with ``` + space', async function () {
      await focusEditor(page)
      await page.keyboard.type('``` ')

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

    test('renders with ```lang + space', async function () {
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

    test('renders with ``` + enter', async function () {
      await focusEditor(page)
      await page.keyboard.type('```')
      await page.keyboard.press('Enter')

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

    test('renders with ```lang + enter', async function () {
      await focusEditor(page)
      await page.keyboard.type('```javascript')
      await page.keyboard.press('Enter')

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

  test('renders with ``` + tab', async function () {
    await focusEditor(page)
    await page.keyboard.type('```')
    await page.keyboard.press('Tab')

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

  test('renders with ```lang + tab', async function () {
    await focusEditor(page)
    await page.keyboard.type('```javascript')
    await page.keyboard.press('Tab')

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

  test('it hides the language input when typing in the code editor and shows it when the mouse moves', async function () {
    await focusEditor(page)
    await page.keyboard.type('```javascript ')
    await page.waitForSelector('[data-inkling-card="codeblock"] .cm-editor')

    // Type in the editor
    await page.keyboard.type('Here are some words')

    const languageInput = page.locator('[data-testid="code-card-language"]')

    // The language input should be hidden
    await expect(languageInput).toHaveClass(/opacity-0/)
    await expect(languageInput).not.toHaveClass(/opacity-100/)

    // Move the mouse
    await page.mouse.move(0, 0)
    await page.mouse.move(100, 100)

    // The language input should be visible
    await expect(languageInput).toHaveClass(/opacity-100/)
    await expect(languageInput).not.toHaveClass(/opacity-0/)
  })

  test('can undo/redo without losing caption', async function () {
    await focusEditor(page)
    await page.keyboard.type('```javascript ')
    await page.waitForSelector('[data-inkling-card="codeblock"] .cm-editor')

    await page.keyboard.type('Here are some words')
    await page.keyboard.press('Escape')
    await page.click('[data-testid="codeblock-caption"]')
    await page.keyboard.type('My caption')
    // let the caption editor's sync to the card node settle so its history
    // entries don't interleave with the deletion entries below
    await waitForCardContentSynced(page, 'codeblock', 'My caption')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Backspace')
    // Lexical's history merges consecutive same-type changes within 1000ms;
    // wait so the card deletion becomes its own undo group
    await waitForHistoryGroupBoundary(page)
    await page.keyboard.press('Backspace')
    await page.keyboard.press(`${ctrlOrCmd(page)}+z`)

    // wait for the decorator to re-render after the historic update restores the card
    await page.waitForSelector('[data-inkling-card="codeblock"][data-inkling-card-editing="false"]')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="codeblock">
            <div>
              <pre><code>Here are some words</code></pre>
              <div><span>javascript</span></div>
            </div>
            <figcaption>
              <div data-inkling-allow-clickthrough="true">
                <div>
                  <div data-inkling="editor">
                    <div contenteditable="true" role="textbox" spellcheck="true" data-lexical-editor="true">
                      <p dir="ltr">
                        <span data-lexical-text="true">My caption</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </figcaption>
            <div data-inkling-card-toolbar="code-block"></div>
          </div>
        </div>
      `,
      { ignoreCardContents: false, ignoreCardToolbarContents: true },
    )
  })

  test('can undo/redo content in code editor', async function () {
    await focusEditor(page)
    await page.keyboard.type('```javascript ')
    await page.waitForSelector('[data-inkling-card="codeblock"] .cm-editor')

    await pasteText(page, 'Here are some words')
    await expect(page.getByText('Here are some words')).toBeVisible()
    await page.keyboard.press('Backspace')
    await expect(page.getByText('Here are some word')).toBeVisible()
    await page.keyboard.press(`${ctrlOrCmd(page)}+z`)
    await expect(page.getByText('Here are some words')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.click('[data-testid="codeblock-caption"]')
    await page.keyboard.type('My caption')
    await page.keyboard.press('Backspace')
    await page.keyboard.press(`${ctrlOrCmd(page)}+z`)

    // wait for the decorator to re-render after the historic update restores the caption
    await page.waitForSelector('[data-inkling-card="codeblock"][data-inkling-card-editing="false"]')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="codeblock">
            <div>
              <pre><code>Here are some words</code></pre>
              <div><span>javascript</span></div>
            </div>
            <figcaption>
              <div data-inkling-allow-clickthrough="true">
                <div>
                  <div data-inkling="editor">
                    <div contenteditable="true" role="textbox" spellcheck="true" data-lexical-editor="true">
                      <p dir="ltr">
                        <span data-lexical-text="true">My caption</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </figcaption>
            <div data-inkling-card-toolbar="code-block"></div>
          </div>
        </div>
      `,
      { ignoreCardContents: false, ignoreCardToolbarContents: true },
    )
  })

  test('goes into display mode when losing focus', async function () {
    await focusEditor(page)
    await page.keyboard.type('```javascript ')
    await page.waitForSelector('[data-inkling-card="codeblock"] .cm-editor')

    await page.keyboard.type('Here are some words')
    await page.getByTestId('post-title').click()
    await page.keyboard.type('post title') // click outside of the editor

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="codeblock">
            <div>
              <pre><code>Here are some words</code></pre>
              <div><span>javascript</span></div>
            </div>
          </div>
        </div>
      `,
    )
  })

  test('can delete selected text', async function () {
    await focusEditor(page)
    await page.keyboard.type('```javascript')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-inkling-card="codeblock"] .cm-editor')

    await page.keyboard.type('const test = true;')

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('ArrowLeft')
    }

    // select "test" - highlight plugin marks it and causes issues with .closest('.cm-editor') in shouldIgnoreEvent()
    // see upstream issue #3785
    await selectBackwards(page, 4)

    await page.keyboard.press('Delete')

    await assertHTML(
      page,
      html`
        <div>
          <span>const</span>
          = true;
        </div>
      `,
      { selector: '.cm-content' },
    )
  })
})
