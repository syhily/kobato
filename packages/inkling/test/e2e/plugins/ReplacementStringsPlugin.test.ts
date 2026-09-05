import { expect, test, type Page } from '@playwright/test'

import { assertHTML, html, initialize } from '#/utils/e2e'

// ReplacementStringsPlugin ships inside InklingNestedComposer, so every nested
// editor gets the {placeholder} → code rewrite. These specs drive it through
// an image card's caption editor (ExtendedTextNode, the top-level theme).
const CAPTION_EDITOR = '[data-testid="image-caption-editor"] div[contenteditable="true"]'

async function focusImageCaption(page: Page) {
  const contentParam = encodeURIComponent(
    JSON.stringify({
      root: {
        children: [
          {
            type: 'image',
            // a file the demo dev server actually serves (public/) — a 404
            // image never loads, stays zero-sized, and can't be clicked
            src: '/inkling-editor-1.png',
            width: 3840,
            height: 2160,
            caption: '',
            cardWidth: 'regular',
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

  // clicking the image selects the card; the caption editor only renders
  // once the card is selected (an empty caption renders nothing otherwise)
  await page.click('[data-inkling-card="image"] img')
  await expect(page.locator('[data-inkling-card="image"]')).toHaveAttribute('data-inkling-card-selected', 'true')
  await page.click(CAPTION_EDITOR)
}

test.describe('ReplacementStringsPlugin', function () {
  test.describe('In a card caption (nested editor)', function () {
    let page: Page
    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage()
    })

    test.beforeEach(async () => {
      await focusImageCaption(page)
    })

    test.afterAll(async () => {
      await page.close()
    })

    test('formats {first_name} as code', async function () {
      await page.keyboard.type('Hello {first_name}!')

      await assertHTML(
        page,
        html`
          <p dir="auto">
            <span data-lexical-text="true">Hello </span>
            <code spellcheck="false" data-lexical-text="true"><span>{first_name}</span></code>
            <span data-lexical-text="true">!</span>
          </p>
        `,
        { selector: CAPTION_EDITOR },
      )
    })

    test('formats {first_name, "fallback"} as code', async function () {
      await page.keyboard.type('Hello {first_name, "there"}!')

      await assertHTML(
        page,
        html`
          <p dir="auto">
            <span data-lexical-text="true">Hello </span>
            <code spellcheck="false" data-lexical-text="true"><span>{first_name, "there"}</span></code>
            <span data-lexical-text="true">!</span>
          </p>
        `,
        { selector: CAPTION_EDITOR },
      )
    })

    test('formats {email} as code', async function () {
      await page.keyboard.type('Your email is {email}')

      await assertHTML(
        page,
        html`
          <p dir="auto">
            <span data-lexical-text="true">Your email is </span>
            <code spellcheck="false" data-lexical-text="true"><span>{email}</span></code>
          </p>
        `,
        { selector: CAPTION_EDITOR },
      )
    })

    test('handles multiple replacement strings in same paragraph', async function () {
      await page.keyboard.type('Hi {first_name}, your email is {email}')

      await assertHTML(
        page,
        html`
          <p dir="auto">
            <span data-lexical-text="true">Hi </span>
            <code spellcheck="false" data-lexical-text="true"><span>{first_name}</span></code>
            <span data-lexical-text="true">, your email is </span>
            <code spellcheck="false" data-lexical-text="true"><span>{email}</span></code>
          </p>
        `,
        { selector: CAPTION_EDITOR },
      )
    })

    test('formats replacement string at start of paragraph', async function () {
      await page.keyboard.type('{first_name} is here')

      await assertHTML(
        page,
        html`
          <p dir="auto">
            <code spellcheck="false" data-lexical-text="true"><span>{first_name}</span></code>
            <span data-lexical-text="true"> is here</span>
          </p>
        `,
        { selector: CAPTION_EDITOR },
      )
    })

    test('formats replacement string at end of paragraph', async function () {
      await page.keyboard.type('Name: {first_name}')

      await assertHTML(
        page,
        html`
          <p dir="auto">
            <span data-lexical-text="true">Name: </span>
            <code spellcheck="false" data-lexical-text="true"><span>{first_name}</span></code>
          </p>
        `,
        { selector: CAPTION_EDITOR },
      )
    })

    test('formats standalone replacement string', async function () {
      await page.keyboard.type('{first_name}')

      await assertHTML(
        page,
        html`
          <p dir="auto">
            <code spellcheck="false" data-lexical-text="true"><span>{first_name}</span></code>
          </p>
        `,
        { selector: CAPTION_EDITOR },
      )
    })

    test('handles adjacent replacement strings', async function () {
      await page.keyboard.type('{first_name}{last_name}')

      await assertHTML(
        page,
        html`
          <p dir="auto">
            <code spellcheck="false" data-lexical-text="true"><span>{first_name}{last_name}</span></code>
          </p>
        `,
        { selector: CAPTION_EDITOR },
      )
    })

    test('does not format incomplete braces', async function () {
      await page.keyboard.type('This {is incomplete')

      await assertHTML(
        page,
        html`
          <p dir="auto">
            <span data-lexical-text="true">This {is incomplete</span>
          </p>
        `,
        { selector: CAPTION_EDITOR },
      )
    })

    test('formats empty braces as replacement string', async function () {
      await page.keyboard.type('Empty {} braces')

      await assertHTML(
        page,
        html`
          <p dir="auto">
            <span data-lexical-text="true">Empty</span>
            <code spellcheck="false" data-lexical-text="true"><span>{}</span></code>
            <span data-lexical-text="true">braces</span>
          </p>
        `,
        { selector: CAPTION_EDITOR },
      )
    })
  })
})
