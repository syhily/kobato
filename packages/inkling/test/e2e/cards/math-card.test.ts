import { expect, test, type Page } from '@playwright/test'

import { focusEditor, initialize, loadSerializedState } from '#/utils/e2e'

test.describe('Math card', () => {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('inserts from the slash menu and previews the host-rendered artifact', async function () {
    // `renderMath=stub` installs the demo's deterministic stand-in for the
    // host's server-side KaTeX channel (demo/DemoApp.tsx).
    await initialize({ page, uri: '/#/?content=false&renderMath=stub' })
    await focusEditor(page)

    await page.keyboard.type('/math')
    await page.waitForSelector('[data-inkling-card-menu-item="Math"][data-inkling-cardmenu-selected="true"]')
    await page.keyboard.press('Enter')

    await expect(page.locator('[data-inkling-card="math"][data-inkling-card-editing="true"]')).toBeVisible()

    // Before any TeX is typed the preview shows the source fallback.
    await expect(page.locator('[data-inkling-math-preview="tex"]')).toBeVisible()

    await page.getByTestId('math-card-tex').fill('x^2 + y^2 = z^2')

    // The host channel resolves an artifact; the preview swaps to it.
    await expect(page.locator('[data-inkling-math-preview="artifact"] svg[data-math-stub="true"]')).toBeVisible()
  })

  test('exports the stored svg artifact through HtmlOutputPlugin', async function () {
    await initialize({ page, uri: '/#/html-output' })

    await loadSerializedState(page, {
      root: {
        children: [
          {
            type: 'math',
            version: 1,
            tex: 'x^2',
            mathml: '',
            svg: '<svg viewBox="0 0 10 10"><path d="M0 0z"/></svg>',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    // The HTML serializer never self-closes svg children.
    await expect(page.getByTestId('html-output')).toContainText(
      '<div class="inkling-card inkling-math-card"><svg viewBox="0 0 10 10"><path d="M0 0z"></path></svg></div>',
    )
  })
})
