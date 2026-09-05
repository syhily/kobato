import { expect, test, type Page } from '@playwright/test'

import { assertHTML, focusEditor, html, initialize, pasteText, selectBackwards } from '#/utils/e2e'

test.describe('Linking', () => {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.beforeEach(async () => {
    // searchLinks (and therefore internal linking) is provided by default,
    // can be turned off with /#/?searchLinks=false
    await initialize({ page })
  })

  test.afterAll(async () => {
    await page.close()
  })

  test.describe('with toolbar', function () {
    const linkButtonSelector = `[data-inkling-floating-toolbar] [data-inkling-toolbar-button="link"] button`

    // selects the typed word "link" and opens the link toolbar on it
    async function openLinkToolbar() {
      await focusEditor(page)
      await page.keyboard.type('link')
      await selectBackwards(page, 4)

      await page.click(linkButtonSelector)
      await expect(page.getByTestId('link-input')).toBeVisible()
      await expect(page.getByTestId('link-input')).toBeFocused()
    }

    test('can type custom link', async function () {
      await openLinkToolbar()

      await page.keyboard.type('https://inkling.local/', { delay: 10 })
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
    })

    test('can paste custom link', async function () {
      await focusEditor(page)
      await page.keyboard.type('link')
      await selectBackwards(page, 4)

      // pasting a URL over a text selection links the selected text
      // (paste path deliberately keeps rel null, unlike the toolbar default)
      await pasteText(page, 'https://inkling.local/')

      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <a href="https://inkling.local/" dir="ltr">
              <span data-lexical-text="true">link</span>
            </a>
          </p>
        `,
      )
    })

    test('can insert a default link', async function () {
      await openLinkToolbar()

      // with no query the input offers the host's default suggestions
      await expect(page.getByTestId('link-input-listOption-label').first()).toHaveText(
        "Remote Work's Impact on Job Markets and Employment",
      )
      await page.getByTestId('link-input-listOption').first().click()

      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <a href="https://source.inkling.local/remote-works-impact-on-job-markets/" rel="noreferrer" dir="ltr">
              <span data-lexical-text="true">link</span>
            </a>
          </p>
        `,
      )
    })

    test('can insert a searched link', async function () {
      await openLinkToolbar()

      await page.keyboard.type('Emo', { delay: 10 })
      await expect(page.getByTestId('link-input-listOption-label')).toHaveText(['✨ Emoji autocomplete ✨'])
      await page.getByTestId('link-input-listOption').first().click()

      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <a href="https://inkling.local/changelog/emoji-picker/" rel="noreferrer" dir="ltr">
              <span data-lexical-text="true">link</span>
            </a>
          </p>
        `,
      )
    })

    test('can edit a link', async function () {
      await focusEditor(page)
      await page.keyboard.type('link')
      await selectBackwards(page, 4)
      await pasteText(page, 'https://inkling.local/')

      // collapse the selection so the format toolbar lets the link toolbar show on hover
      await page.keyboard.press('ArrowRight')

      await page.hover('p a')
      await page.getByTestId('link-toolbar-edit').click()

      const linkInput = page.getByTestId('link-input')
      await expect(linkInput).toHaveValue('https://inkling.local/')
      await linkInput.fill('https://inkling.local/updated/')
      await page.keyboard.press('Enter')

      await assertHTML(
        page,
        html`
          <p dir="ltr">
            <a href="https://inkling.local/updated/" rel="noreferrer" dir="ltr">
              <span data-lexical-text="true">link</span>
            </a>
          </p>
        `,
      )
    })

    test('can remove a link', async function () {
      await focusEditor(page)
      await page.keyboard.type('link')
      await selectBackwards(page, 4)
      await pasteText(page, 'https://inkling.local/')

      // collapse the selection so the format toolbar lets the link toolbar show on hover
      await page.keyboard.press('ArrowRight')

      await page.hover('p a')
      await page.getByTestId('link-toolbar-remove').click()

      await assertHTML(page, html` <p dir="ltr"><span data-lexical-text="true">link</span></p> `)
    })
  })

  test.describe('with @-link', function () {
    test('displays default links with no query', async function () {
      await focusEditor(page)
      await page.keyboard.type('@')

      await assertHTML(
        page,
        html`
          <p>
            <span>
              <svg></svg>
              <span data-lexical-text="true">‌</span>
              <span data-placeholder="Find a post, tag or author" data-lexical-text="true"></span>
            </span>
          </p>
        `,
      )

      await assertHTML(
        page,
        html`
          <div>
            <div>
              <div>
                <ul>
                  <li><div>Latest posts</div></li>
                  <li aria-selected="true" role="option">
                    <span>
                      <svg></svg>
                      <span>Remote Work's Impact on Job Markets and Employment</span>
                    </span>
                    <span>
                      <span title="Members only"><svg></svg></span>
                      <span>8 May 2024</span>
                    </span>
                  </li>
                  <li aria-selected="false" role="option">
                    <span>
                      <svg></svg>
                      <span>Robotics Renaissance: How Automation is Transforming Industries</span>
                    </span>
                  </li>
                  <li aria-selected="false" role="option">
                    <span>
                      <svg></svg>
                      <span>Biodiversity Conservation in Fragile Ecosystems</span>
                    </span>
                  </li>
                  <li aria-selected="false" role="option">
                    <span>
                      <svg></svg>
                      <span
                        >Unveiling the Crisis of Plastic Pollution: Analyzing Its Profound Impact on the
                        Environment</span
                      >
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        `,
        { selector: '[data-testid="at-link-popup"]' },
      )
    })

    test('can search for links', async function () {
      await focusEditor(page)
      await page.keyboard.type('@')
      await page.keyboard.type('Emo')

      await assertHTML(
        page,
        html`
          <p>
            <span dir="ltr">
              <svg></svg>
              <span data-lexical-text="true">‌</span>
              <span data-placeholder="" data-lexical-text="true">Emo</span>
            </span>
          </p>
        `,
      )

      // wait for search to complete
      await expect(page.locator('[data-testid="at-link-results-listOption-label"]')).toContainText([
        '✨ Emoji autocomplete ✨',
      ])

      await assertHTML(
        page,
        html`
          <div>
            <div>
              <div>
                <ul>
                  <li><div>Posts</div></li>
                  <li aria-selected="true" role="option">
                    <span>
                      <svg></svg>
                      <span>
                        <span>✨</span>
                        <span>Emo</span>
                        <span>ji autocomplete ✨</span>
                      </span>
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        `,
        { selector: '[data-testid="at-link-popup"]' },
      )
    })

    test('has custom no result options', async function () {
      await focusEditor(page)
      await page.keyboard.type('@')
      await page.keyboard.type('Unknown page')

      await expect(page.locator('[data-testid="at-link-popup"]')).toContainText('No results found')

      await page.keyboard.press('Enter')

      await assertHTML(page, html` <p><span data-lexical-text="true">@Unknown page</span></p> `)
    })

    test('keeps typed text when Enter is pressed with no matching suggestions', async function () {
      await focusEditor(page)
      await page.keyboard.type('@zz-no-such-internal-post-zz')
      await expect(page.getByTestId('at-link-results')).toBeVisible()

      await page.keyboard.press('Enter')

      await assertHTML(
        page,
        html`
          <p>
            <span data-lexical-text="true">@zz-no-such-internal-post-zz</span>
          </p>
        `,
      )
    })

    test('removes at-linking when backspacing', async function () {
      await focusEditor(page)
      await page.keyboard.type('@')
      await page.keyboard.type('AB')

      await page.keyboard.press('Backspace')
      await page.keyboard.press('Backspace')
      // we should now have an empty input field with placeholder text
      await assertHTML(
        page,
        html`
          <p>
            <span>
              <svg></svg>
              <span data-lexical-text="true">‌</span>
              <span data-placeholder="Find a post, tag or author" data-lexical-text="true"></span>
            </span>
          </p>
        `,
      )

      // small wait for DOM to settle before backspace removes the at-link
      await page.waitForTimeout(50)
      await page.keyboard.press('Backspace')

      // it should now remove the at-linking entirely leaving only an @
      await assertHTML(page, html` <p><span data-lexical-text="true">@</span></p> `)
    })

    test('creates a bookmark when at-linking from a line', async function () {
      await focusEditor(page)

      await page.keyboard.type('@')
      await page.keyboard.type('Emo')
      await expect(page.locator('[data-testid="at-link-results-listOption-label"]')).toContainText([
        '✨ Emoji autocomplete ✨',
      ])
      await page.keyboard.press('Enter')
      // now wait till data-testid="bookmark-container" appears
      await page.waitForSelector('[data-testid="bookmark-container"]')
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="bookmark">
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
              </div>
            </div>
          </div>
          <div contenteditable="false" data-lexical-cursor="true"></div>
        `,
        { ignoreCardToolbarContents: true, ignoreInnerSVG: true },
      )
    })

    test('can paste into at-link node', async function () {
      await focusEditor(page)
      await page.keyboard.type('@')
      await pasteText(page, 'https://inkling.local')
      await expect(page.getByTestId('at-link-results')).toBeVisible()

      await assertHTML(
        page,
        html`
          <p>
            <span dir="ltr">
              <svg></svg>
              <span data-lexical-text="true">‌</span>
              <span data-placeholder="" data-lexical-text="true">https://inkling.local</span>
            </span>
          </p>
        `,
      )
    })
  })
})
