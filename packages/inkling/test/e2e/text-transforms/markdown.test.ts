import { expect, test, type Page } from '@playwright/test'

import { assertHTML, focusEditor, html, initialize, pasteText } from '#/utils/e2e'

const HEADLINE_TRANSFORMS = [
  {
    text: '# ',
    html: html`<h1><br /></h1>`,
  },
  {
    text: '# Test',
    html: html`<h1 dir="ltr"><span data-lexical-text="true">Test</span></h1>`,
  },
  {
    text: '## Test',
    html: html`<h2 dir="ltr"><span data-lexical-text="true">Test</span></h2>`,
  },
  {
    text: '### Test',
    html: html`<h3 dir="ltr"><span data-lexical-text="true">Test</span></h3>`,
  },
  {
    text: '#### Test',
    html: html`<h4 dir="ltr"><span data-lexical-text="true">Test</span></h4>`,
  },
  {
    text: '##### Test',
    html: html`<h5 dir="ltr"><span data-lexical-text="true">Test</span></h5>`,
  },
  {
    text: '###### Test',
    html: html`<h6 dir="ltr"><span data-lexical-text="true">Test</span></h6>`,
  },
  {
    text: '####### Test',
    html: html`<p dir="ltr"><span data-lexical-text="true">####### Test</span></p>`,
  },
]

const EMPHASIS_TRANSFORMS = [
  {
    text: '**This is bold text**',
    html: html`<p dir="ltr"><strong data-lexical-text="true">This is bold text</strong></p>`,
  },
  {
    text: '__This is bold text__',
    html: html`<p dir="ltr"><strong data-lexical-text="true">This is bold text</strong></p>`,
  },
  {
    text: '*This is italic text*',
    html: html`<p dir="ltr"><em class="italic" data-lexical-text="true">This is italic text</em></p>`,
  },
  {
    text: '_This is italic text_',
    html: html`<p dir="ltr"><em class="italic" data-lexical-text="true">This is italic text</em></p>`,
  },
  {
    text: '~~Strikethrough~~',
    html: html`<p dir="ltr"><span class="line-through" data-lexical-text="true">Strikethrough</span></p>`,
  },
]

const SPECIAL_MARKUP_TRANSFORMS = [
  {
    text: '~~strikethrough~~',
    html: html`<p dir="ltr"><span class="line-through" data-lexical-text="true">strikethrough</span></p>`,
  },
  {
    text: '`code`',
    html: html`<p dir="ltr">
      <code spellcheck="false" data-lexical-text="true"><span>code</span></code>
    </p>`,
  },
  {
    text: '^superscript^',
    html: html`<p dir="ltr">
      <sup data-lexical-text="true"><span>superscript</span></sup>
    </p>`,
  },
  {
    text: '~subscript~',
    html: html`<p dir="ltr">
      <sub data-lexical-text="true"><span>subscript</span></sub>
    </p>`,
  },
]

test.describe('Markdown', () => {
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

  test('converts markdown img to html', async function () {
    await focusEditor(page)
    await pasteText(page, '![Image](https://octodex.github.com/images/minion.png)')

    await expect(page.getByTestId('image-card-populated')).toBeVisible()
    await expect(page.locator('img')).toHaveAttribute('src', 'https://octodex.github.com/images/minion.png')
  })

  test('converts markdown link to html', async function () {
    await focusEditor(page)
    await pasteText(page, '[link](https://inkling.local/)')

    await expect(page.locator('a[href="https://inkling.local/"]')).toBeVisible()
  })

  test('converts to code card', async function () {
    await focusEditor(page)
    await pasteText(
      page,
      `
        // Some comments
    line 1 of code
    line 2 of code
    line 3 of code
    `,
    )

    await expect(page.locator('[data-inkling-card="codeblock"]')).toBeVisible()
  })

  test('converts --- to hr', async function () {
    await focusEditor(page)
    await pasteText(page, '---')

    await expect(page.locator('[data-inkling-card="horizontalrule"]')).toBeVisible()
  })

  test.describe('converts ## to headlines', function () {
    HEADLINE_TRANSFORMS.forEach((testCase) => {
      test(`${testCase.text} -> heading`, async function () {
        await focusEditor(page)
        await pasteText(page, testCase.text)
        await assertHTML(page, testCase.html)
      })
    })
  })

  test.describe('converts emphasis to html', function () {
    EMPHASIS_TRANSFORMS.forEach((testCase) => {
      test(testCase.text, async function () {
        await focusEditor(page)
        await pasteText(page, testCase.text)
        await assertHTML(page, testCase.html)
      })
    })
  })

  test.describe('backspace undoes special markdown', function () {
    SPECIAL_MARKUP_TRANSFORMS.forEach((testCase) => {
      test(testCase.text, async function () {
        await focusEditor(page)
        await pasteText(page, testCase.text)
        await assertHTML(page, testCase.html)
        await page.keyboard.press('Backspace')
        await assertHTML(
          page,
          html`<p dir="ltr"><span data-lexical-text="true">${testCase.text.slice(0, -1)}</span></p>`,
        )
      })
    })
  })

  test('does not convert markdown to html if pasting with shift', async function () {
    await focusEditor(page)
    await page.keyboard.down('Shift')
    await pasteText(
      page,
      `
        [link](https://inkling.local/)

        ---

        You will like those
        projects!

        ![Image](https://octodex.github.com/images/minion.png)
        `,
    )
    await expect(page.getByTestId('image-card-populated')).toHaveCount(0)
    await expect(page.locator('a[href="https://inkling.local/"]')).toHaveCount(0)
    await expect(page.locator('[data-inkling-card="horizontalrule"]')).toHaveCount(0)
  })

  test('converts table to a native table', async function () {
    await focusEditor(page)
    await pasteText(
      page,
      '<table><tr><th>Month</th><th>Savings</th></tr><tr><td>January</td><td>$100</td></tr><tr><td>February</td><td>$80</td></tr></table>',
    )

    // the native table family claims the pasted <table>: header cells land in
    // th, body cells in td — the html card no longer sees it
    const table = page.locator('.inkling-lexical table')
    await expect(table).toBeVisible()
    await expect(table.locator('tr')).toHaveCount(3)
    await expect(table.locator('th')).toHaveText(['Month', 'Savings'])
    await expect(table.locator('td')).toHaveText(['January', '$100', 'February', '$80'])
    await expect(page.locator('[data-inkling-card="html"]')).toHaveCount(0)
  })
})
