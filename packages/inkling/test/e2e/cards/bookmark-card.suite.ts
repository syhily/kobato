import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  createSnippet,
  ctrlOrCmd,
  focusEditor,
  html,
  initialize,
  insertCard,
  waitForCardContentSynced,
  waitForHistoryGroupBoundary,
} from '#/utils/e2e'

// The shared bookmark card suite — the with-searchLinks and without-searchLinks
// specs run the same thirteen bodies; the only divergence is the initialize
// URI and the URL input's placeholder (search on/off). The search-specific
// tests stay in bookmark-card-with-search.test.ts. Not a .test.ts file:
// Playwright picks up the two callers, not this module.
export function describeBookmarkCardSuite({
  title,
  uri,
  urlPlaceholder,
}: {
  title: string
  uri?: string
  urlPlaceholder: string
}) {
  test.describe(title, () => {
    let page: Page
    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage()
    })

    test.beforeEach(async () => {
      await initialize(uri === undefined ? { page } : { page, uri })
    })

    test.afterAll(async () => {
      await page.close()
    })

    test('can import serialized bookmark card nodes', async function () {
      const contentParam = encodeURIComponent(
        JSON.stringify({
          root: {
            children: [
              {
                type: 'bookmark',
                url: 'https://inkling.local/',
                caption: 'caption here',
                metadata: {
                  icon: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                  title: 'Inkling: The Creator Economy Platform',
                  description: 'lorem ipsum dolor amet lorem ipsum dolor amet',
                  author: 'inkling',
                  publisher: 'Inkling - The Professional Publishing Platform',
                  thumbnail: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                },
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
            <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="bookmark">
              <div>
                <div>
                  <div>
                    <div>Inkling: The Creator Economy Platform</div>
                    <div>lorem ipsum dolor amet lorem ipsum dolor amet</div>
                    <div>
                      <img
                        alt=""
                        src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                      />
                      <span>Inkling - The Professional Publishing Platform</span>
                      <span>inkling</span>
                    </div>
                  </div>
                  <div>
                    <img alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
                  </div>
                  <div></div>
                </div>
                <figcaption>
                  <div data-inkling-allow-clickthrough="true">
                    <div>
                      <div data-inkling="editor">
                        <div contenteditable="true" role="textbox" spellcheck="true" data-lexical-editor="true">
                          <p dir="ltr">
                            <span data-lexical-text="true">caption here</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </figcaption>
              </div>
            </div>
          </div>
        `,
        { ignoreCardToolbarContents: true, ignoreInnerSVG: true },
      )
    })

    test('renders bookmark card node', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="bookmark"></div>
          </div>
          <p><br /></p>
        `,
        { ignoreCardContents: true },
      )
    })

    test('can interact with url input after inserting', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })

      const urlInput = page.getByTestId('bookmark-url')
      await expect(urlInput).toHaveAttribute('placeholder', urlPlaceholder)

      await urlInput.fill('test')
      await expect(urlInput).toHaveValue('test')
    })

    test.describe('Valid URL handling', () => {
      test('shows loading wheel', async function () {
        await focusEditor(page)
        await insertCard(page, { cardName: 'bookmark' })

        const urlInput = page.getByTestId('bookmark-url')
        await urlInput.fill('https://inkling.local/')
        await urlInput.press('Enter')

        await expect(page.getByTestId('bookmark-url-loading-container')).toBeVisible()
        await expect(page.getByTestId('bookmark-url-loading-spinner')).toBeVisible()
      })

      test('displays expected metadata', async function () {
        await focusEditor(page)
        await insertCard(page, { cardName: 'bookmark' })

        const urlInput = page.getByTestId('bookmark-url')
        await urlInput.fill('https://inkling.local/')
        await urlInput.press('Enter')

        await expect(page.getByTestId('bookmark-title')).toHaveText('Inkling: The Creator Economy Platform')
        await expect(page.getByTestId('bookmark-description')).toContainText(
          'The former of the two songs addresses the issue of negative rumors in a relationship, while the latter, with a more upbeat pulse, is a classic club track; the single is highlighted by a hyped bridge.',
        )
        await expect(page.getByTestId('bookmark-publisher')).toContainText(
          'Inkling - The Professional Publishing Platform',
        )
      })

      // TODO: the caption editor is very nested, and we don't have an actual input field here, so we aren't testing for filling it
      test('caption displays on insert', async function () {
        await focusEditor(page)
        await insertCard(page, { cardName: 'bookmark' })

        const urlInput = page.getByTestId('bookmark-url')
        await urlInput.fill('https://inkling.local/')
        await urlInput.press('Enter')

        const captionInput = page.getByTestId('bookmark-caption')
        await expect(captionInput).toContainText('Type caption for bookmark (optional)')
      })
    })

    test.describe('Error Handling', () => {
      test('bad url entry shows error message', async function () {
        await focusEditor(page)
        await insertCard(page, { cardName: 'bookmark' })

        const urlInput = page.getByTestId('bookmark-url')
        await urlInput.fill('badurl')
        await expect(urlInput).toHaveValue('badurl')
        await urlInput.press('Enter')

        await expect(page.getByTestId('bookmark-url-error-message')).toContainText("Oops, that link didn't work.")
      })

      test('retry button bring back url input', async function () {
        await focusEditor(page)
        await insertCard(page, { cardName: 'bookmark' })

        const urlInput = page.getByTestId('bookmark-url')
        await expect(urlInput).toHaveAttribute('placeholder', urlPlaceholder)

        await urlInput.fill('badurl')
        await expect(urlInput).toHaveValue('badurl')
        await urlInput.press('Enter')

        const retryButton = page.getByTestId('bookmark-url-error-retry')
        await retryButton.click()

        const urlInputRetry = page.getByTestId('bookmark-url')
        await expect(urlInputRetry).toHaveValue('badurl')
        await expect(retryButton).not.toBeVisible()
      })

      test('paste as link button removes card and inserts text node link', async function () {
        await focusEditor(page)
        await insertCard(page, { cardName: 'bookmark' })

        const urlInput = page.getByTestId('bookmark-url')
        await expect(urlInput).toHaveAttribute('placeholder', urlPlaceholder)

        await urlInput.fill('badurl')
        await expect(urlInput).toHaveValue('badurl')
        await urlInput.press('Enter')

        const retryButton = page.getByTestId('bookmark-url-error-pasteAsLink')
        await retryButton.click()

        await assertHTML(
          page,
          html`
            <p>
              <a href="https://badurl" dir="ltr"><span data-lexical-text="true">badurl</span></a>
            </p>
            <p><br /></p>
          `,
        )
      })

      test('close button removes card', async function () {
        await focusEditor(page)
        await insertCard(page, { cardName: 'bookmark' })

        const urlInput = page.getByTestId('bookmark-url')
        await expect(urlInput).toHaveAttribute('placeholder', urlPlaceholder)

        await urlInput.fill('badurl')
        await expect(urlInput).toHaveValue('badurl')
        await urlInput.press('Enter')

        const retryButton = page.getByTestId('bookmark-url-error-close')
        await retryButton.click()

        await assertHTML(page, html`<p><br /></p>`)
      })
    })

    test('can add snippet', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })

      const urlInput = page.getByTestId('bookmark-url')
      await urlInput.fill('https://inkling.local/')
      await urlInput.press('Enter')
      await expect(page.getByTestId('bookmark-description')).toBeVisible()

      // create snippet
      await page.keyboard.press('Escape')
      await createSnippet(page)

      // can insert card from snippet
      await page.keyboard.press('Enter')
      await page.keyboard.type('/snippet')
      await expect(page.locator('[data-inkling-cardmenu-selected="true"]').filter({ hasText: 'snippet' })).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(page.locator('[data-inkling-card="bookmark"]')).toHaveCount(2)
    })

    test('can undo/redo without losing caption', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })

      const urlInput = page.getByTestId('bookmark-url')
      await urlInput.fill('https://inkling.local/')
      await urlInput.press('Enter')
      await expect(page.getByTestId('bookmark-description')).toBeVisible()

      await page.click('[data-testid="bookmark-caption"]')
      await page.keyboard.type('My test caption')
      // let the caption editor's sync to the card node settle so its history
      // entries don't interleave with the deletion entries below
      await waitForCardContentSynced(page, 'bookmark', 'My test caption')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Backspace')
      // Lexical's history merges consecutive same-type changes within 1000ms;
      // wait so the card deletion becomes its own undo group
      await waitForHistoryGroupBoundary(page)
      await page.keyboard.press('Backspace')
      await page.keyboard.press(`${ctrlOrCmd(page)}+z`)

      // wait for the decorator to re-render after the historic update restores the card
      await page.waitForSelector('[data-inkling-card="bookmark"][data-inkling-card-editing="false"]')

      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="bookmark">
              <div>
                <div>
                  <div>
                    <div>Inkling: The Creator Economy Platform</div>
                    <div>
                      The former of the two songs addresses the issue of negative rumors in a relationship, while the
                      latter, with a more upbeat pulse, is a classic club track; the single is highlighted by a hyped
                      bridge.
                    </div>
                    <div>
                      <img
                        alt=""
                        src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                      />
                      <span>Inkling - The Professional Publishing Platform</span>
                      <span>Author McAuthory</span>
                    </div>
                  </div>
                  <div>
                    <img alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
                  </div>
                  <div></div>
                </div>
                <figcaption>
                  <div data-inkling-allow-clickthrough="true">
                    <div>
                      <div data-inkling="editor">
                        <div contenteditable="true" role="textbox" spellcheck="true" data-lexical-editor="true">
                          <p dir="ltr">
                            <span data-lexical-text="true">My test caption</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </figcaption>
              </div>
              <div data-inkling-card-toolbar="bookmark"></div>
            </div>
          </div>
          <p><br /></p>
        `,
        { ignoreCardToolbarContents: true, ignoreInnerSVG: true },
      )
    })

    test('escape removes url input component', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })

      await page.keyboard.press('Escape')

      await assertHTML(page, html` <p><br /></p> `, { ignoreCardContents: true })
    })

    test('escape removes url error component', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })

      await page.keyboard.type('badurl')
      await page.keyboard.press('Enter')

      await expect(page.getByTestId('bookmark-url-error-message')).toContainText("Oops, that link didn't work.")

      await page.keyboard.press('Escape')

      await assertHTML(page, html` <p><br /></p> `, { ignoreCardContents: true })
    })
  })
}
