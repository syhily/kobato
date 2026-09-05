import { expect, test, type Page } from '@playwright/test'

import { assertHTML, focusEditor, html, initialize, insertCard, pasteText } from '#/utils/e2e'

import { describeBookmarkCardSuite } from './bookmark-card.suite'

describeBookmarkCardSuite({
  title: 'Bookmark card (with searchLinks)',
  urlPlaceholder: 'Paste URL or search posts and pages...',
})

// The searchLinks-only tests: the shared bookmark suite lives in
// bookmark-card.suite.ts (URI + placeholder are the only divergence).
test.describe('Bookmark card search', () => {
  let page: Page
  let errors: string[] = []

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()

    page.on('pageerror', (err) => {
      errors.push(err.message)
    })
  })

  test.beforeEach(async () => {
    errors = []
    await initialize({ page })
  })

  test.afterAll(async () => {
    await page.close()
  })

  // AtLinkPlugin added a PASTE_COMMAND handler which didn't account for
  // pastes occurring in input fields inside the main editor resulting in a TypeError
  test('can paste into URL input', async function () {
    await focusEditor(page)
    await insertCard(page, { cardName: 'bookmark' })

    const urlInput = page.getByTestId('bookmark-url')
    await expect(urlInput).toBeFocused()

    await pasteText(page, 'https://inkling.local/')

    expect(errors).toEqual([])
  })

  // Searchable URL input ----------------------------------------------------

  test.describe('Search', function () {
    test('shows default options when opening', async function () {
      await page.mouse.move(0, 0) // was triggering hover state on option after the first
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })
      await expect(page.getByTestId('bookmark-url-dropdown')).toBeVisible()
      await assertHTML(
        page,
        html`
          <div data-lexical-decorator="true" contenteditable="false">
            <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="bookmark">
              <div>
                <div>
                  <div><input placeholder="Paste URL or search posts and pages..." value="" /></div>
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
          </div>
          <p><br /></p>
        `,
      )
    })

    test('shows metadata on selected items', async function () {
      await page.mouse.move(0, 0) // avoid hover state interfering with keyboard selection
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })
      await expect(page.getByTestId('bookmark-url-dropdown')).toBeVisible()

      await assertHTML(
        page,
        html`
          <span>
            <svg></svg>
            <span>Remote Work's Impact on Job Markets and Employment</span>
          </span>
          <span>
            <span title="Members only"><svg></svg></span>
            <span>8 May 2024</span>
          </span>
        `,
        { selector: '[data-testid="bookmark-url-listOption"][aria-selected="true"]' },
      )

      // wait for dropdown to fully settle before navigating
      await page.waitForTimeout(100)

      await page.keyboard.press('ArrowDown')

      // wait for selection to move to the second item
      await expect(page.locator('[data-testid="bookmark-url-listOption"]').nth(1)).toHaveAttribute(
        'aria-selected',
        'true',
      )

      // check all conditions atomically because the dropdown selection can be unstable
      await expect(async () => {
        const firstItemText = await page.locator('[data-testid="bookmark-url-listOption"]').nth(0).textContent()
        const selectedItemText = await page
          .locator('[data-testid="bookmark-url-listOption"][aria-selected="true"]')
          .textContent()

        // first item no longer shows metadata
        expect(firstItemText).not.toContain('May 2024')

        // second now-selected item shows metadata
        expect(selectedItemText).toContain('Robotics Renaissance')
        expect(selectedItemText).toContain('2 May 2024')
      }).toPass()
    })

    test('highlights matches in results', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })
      await expect(page.getByTestId('bookmark-url-dropdown')).toBeVisible()

      await page.keyboard.type('Emoji')

      await expect(page.locator('[data-testid="bookmark-url-listOption"]')).toBeVisible()
      await expect(page.locator('span.font-bold').first()).toHaveText('Emoji')
    })

    test('does not crash with regexp chars in search', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })
      await expect(page.getByTestId('bookmark-url-dropdown')).toBeVisible()

      await page.keyboard.type('[')

      await expect(page.locator('[data-testid="bookmark-url-dropdown"]')).toBeVisible()
    })

    test('filters options whilst typing', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })
      await expect(page.getByTestId('bookmark-url-dropdown')).toBeVisible()

      await page.keyboard.type('e')

      await expect(page.locator('[data-testid="bookmark-url-listOption"][aria-selected="true"]')).toContainText(
        'TK Reminders',
      )

      await page.keyboard.type('mo')

      await expect(page.locator('[data-testid="bookmark-url-listOption"][aria-selected="true"]')).toContainText(
        '✨ Emoji autocomplete ✨',
      )
    })

    test('can change selected item with arrow keys', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })
      await expect(page.getByTestId('bookmark-url-dropdown')).toBeVisible()

      await expect(page.locator('[data-testid="bookmark-url-listOption"][aria-selected="true"]')).toContainText(
        "Remote Work's Impact on Job Markets and Employment",
      )
      await page.keyboard.press('ArrowDown')
      await expect(page.locator('[data-testid="bookmark-url-listOption"][aria-selected="true"]')).toContainText(
        'Robotics Renaissance: How Automation is Transforming Industries',
      )
      await page.keyboard.press('ArrowUp')
      await expect(page.locator('[data-testid="bookmark-url-listOption"][aria-selected="true"]')).toContainText(
        "Remote Work's Impact on Job Markets and Employment",
      )
    })

    test('inserts selected item on enter', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })
      await expect(page.getByTestId('bookmark-url-dropdown')).toBeVisible()
      await page.keyboard.type('Emoji')
      await expect(page.locator('[data-testid="bookmark-url-listOption"][aria-selected="true"]')).toContainText(
        '✨ Emoji autocomplete ✨',
      )
      await page.keyboard.press('Enter')

      // NOTE: this doesn't test for the right item being inserted because
      // the demo app always inserts a mocked oembed response
      await expect(page.getByTestId('bookmark-url-loading-spinner')).toBeVisible()
      await expect(page.getByTestId('bookmark-container')).toBeVisible()
    })

    test('inserts item on click', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })
      await page.click('[data-testid="bookmark-url-listOption"]:nth-child(2)')

      // NOTE: this doesn't test for the right item being inserted because
      // the demo app always inserts a mocked oembed response
      await expect(page.getByTestId('bookmark-url-loading-spinner')).toBeVisible()
      await expect(page.getByTestId('bookmark-container')).toBeVisible()
    })

    test('handles Enter with no matching result', async function () {
      await focusEditor(page)
      await insertCard(page, { cardName: 'bookmark' })
      await page.keyboard.type('Not a valid match')

      await expect(page.getByText('Enter URL to create link')).toBeVisible()

      await page.keyboard.press('Enter')

      await expect(page.getByText('Enter URL to create link')).toBeVisible()

      expect(errors).toEqual([])
    })

    ;['http', '#test', '/test', 'mailto:'].forEach((expected) => {
      test(`handles URL-like inputs (${expected})`, async function () {
        await focusEditor(page)
        await insertCard(page, { cardName: 'bookmark' })
        await expect(page.getByTestId('bookmark-url-dropdown')).toBeVisible()

        await page.keyboard.type(expected, { delay: 10 })
        await expect(page.getByTestId('input-list-spinner')).not.toBeVisible()

        await assertHTML(
          page,
          html`
            <li><div>Link to web page</div></li>
            <li aria-selected="true" role="option">
              <span>
                <svg></svg>
                <span>${expected}</span>
              </span>
            </li>
          `,
          { selector: '[data-testid="bookmark-url-dropdown"]' },
        )
      })
    })
  })
})
