import { expect, test, type Page } from '@playwright/test'

import { focusEditor, initialize } from '#/utils/e2e'

test.describe('Snippet Plugin', function () {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.beforeEach(async () => {
    await initialize({ page })
    // Set localStorage to enable snippets
    const defaultSnippets = [
      {
        name: 'planes',
        value:
          '{"namespace":"InklingEditor","nodes":[{"type":"image","version":1,"src":"https://static.inkling.local/v5.0.0/images/publication-cover.jpg","width":5046,"height":3364,"title":"","alt":"white biplane","caption":"<span style=\\"white-space: pre-wrap;\\">Photo by </span><a href=\\"https://unsplash.com/@zhpix\\"><span style=\\"white-space: pre-wrap;\\">Pascal Meier</span></a><span style=\\"white-space: pre-wrap;\\"> / </span><a href=\\"https://unsplash.com/?utm_source=inkling&amp;utm_medium=referral&amp;utm_campaign=api-credit\\"><span style=\\"white-space: pre-wrap;\\">Unsplash</span></a>","cardWidth":"regular","href":""},{"type":"image","version":1,"src":"https://static.inkling.local/v5.0.0/images/publication-cover.jpg","width":5046,"height":3364,"title":"","alt":"white biplane","caption":"<span style=\\"white-space: pre-wrap;\\">Photo by </span><a href=\\"https://unsplash.com/@zhpix\\"><span style=\\"white-space: pre-wrap;\\">Pascal Meier</span></a><span style=\\"white-space: pre-wrap;\\"> / </span><a href=\\"https://unsplash.com/?utm_source=inkling&amp;utm_medium=referral&amp;utm_campaign=api-credit\\"><span style=\\"white-space: pre-wrap;\\">Unsplash</span></a>","cardWidth":"regular","href":""}]}',
      },
    ]

    await page.evaluate((snippets) => {
      localStorage.setItem('snippets', JSON.stringify(snippets))
    }, defaultSnippets)

    await page.reload() // Ensure the page reloads to pick up the new localStorage values
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('Can Insert a snippet with multiple nodes', async function () {
    await focusEditor(page)
    await page.keyboard.type('/snippet')
    // Wait for snippet to appear in slash menu before pressing Enter
    await expect(page.locator('[data-inkling-cardmenu-selected="true"]').filter({ hasText: 'planes' })).toBeVisible()
    await page.keyboard.press('Enter')
    // the 'planes' snippet holds two image nodes — assert both cards mount
    // (the old toBeNull check hid that the bare locator matches 2 elements,
    // which makes toBeVisible fail strict mode)
    await expect(page.locator('[data-inkling-card="image"]')).toHaveCount(2)
  })
})
