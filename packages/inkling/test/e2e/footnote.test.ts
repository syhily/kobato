import { expect, test, type Page } from '@playwright/test'

import { focusEditor, initialize, loadSerializedState } from '#/utils/e2e'

// Footnotes: `^ ` triggers the insert,
// focus hands off to the fresh definition row, edits renumber automatically,
// and deleting a definition takes its refs with it.

const ref = (text: string, targetKey: string) => ({
  type: 'footnote-ref',
  version: 1,
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text,
  targetKey,
})

const text = (content: string) => ({
  type: 'text',
  version: 1,
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: content,
})

const definition = (targetKey: string, content: string) => ({
  type: 'footnotedefinition',
  version: 1,
  targetKey,
  content,
})

// Two citations in one paragraph, definitions already in citation order.
const TWO_FOOTNOTE_STATE = JSON.stringify({
  root: {
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        children: [ref('1', 'keyA'), text(' and '), ref('2', 'keyB')],
      },
      definition('keyA', '<p>Alpha</p>'),
      definition('keyB', '<p>Beta</p>'),
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
})

const definitionRows = (page: Page) => page.locator('[data-inkling-footnote-definition]')

test.describe('Footnotes', () => {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('`^ ` inserts a footnote and hands focus to the definition row', async function () {
    await initialize({ page, uri: '/#/?content=false' })
    await focusEditor(page)

    await page.keyboard.type('hello ^ ')

    // the ref renders inline as the first citation, the trigger text consumed
    const paragraph = page.locator('.inkling-lexical p').first()
    await expect(paragraph.locator('.inkling-footnote-ref')).toHaveText('1')
    await expect(paragraph).toContainText('hello')

    // the definition row appears at the document end with its badge
    const row = definitionRows(page)
    await expect(row).toHaveCount(1)
    await expect(row.locator('[data-inkling-footnote-definition-index]')).toHaveText('1.')

    // focus handed off to the row's nested editor: typing lands there
    await page.keyboard.type('First note')
    await expect(row.locator('[data-testid="footnote-definition-content"]')).toContainText('First note')
  })

  test('deleting a ref renumbers the survivors and tails the orphan', async function () {
    await initialize({ page, uri: '/#/?content=false' })

    await loadSerializedState(page, TWO_FOOTNOTE_STATE)

    await expect(page.locator('.inkling-footnote-ref')).toHaveCount(2)
    await expect(definitionRows(page)).toHaveCount(2)

    // caret before the first ref (the paragraph starts with it). A native
    // range plus a manual selectionchange dispatch is the deterministic way
    // to place it (card-behaviour.test.ts precedent) — clicking the
    // paragraph box lands at the line end, where a forward Delete eats the
    // definition CARD instead of the ref
    await page.locator('.inkling-lexical p').first().click()
    await page.evaluate(() => {
      const rootElement = window.lexicalEditor.getRootElement()
      const refSpan = rootElement?.querySelector('p .inkling-footnote-ref')
      const textNode = refSpan?.firstChild
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        throw new Error('expected the first footnote ref text')
      }
      const range = document.createRange()
      range.setStart(textNode, 0)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await page.waitForTimeout(50)
    await page.keyboard.press('Delete')

    // ref 2 is renumbered to 1…
    await expect(page.locator('.inkling-footnote-ref')).toHaveCount(1)
    await expect(page.locator('.inkling-footnote-ref')).toHaveText('1')

    // …its row leads with the new badge, and the orphaned Alpha row tails
    const rows = definitionRows(page)
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator('[data-inkling-footnote-definition-index]')).toHaveText('1.')
    await expect(rows.nth(0)).toContainText('Beta')
    await expect(rows.nth(1).locator('[data-inkling-footnote-definition-index]')).toHaveText('2.')
    await expect(rows.nth(1)).toContainText('Alpha')
  })

  test('deleting a definition removes the refs citing it', async function () {
    await initialize({ page, uri: '/#/?content=false' })

    await loadSerializedState(page, TWO_FOOTNOTE_STATE)

    const rows = definitionRows(page)
    await expect(rows).toHaveCount(2)

    await rows.filter({ hasText: 'Alpha' }).locator('[data-inkling-footnote-definition-delete]').click()

    // the Alpha row and its citing ref are gone; Beta renumbers to 1
    await expect(definitionRows(page)).toHaveCount(1)
    await expect(page.locator('.inkling-footnote-ref')).toHaveCount(1)
    await expect(page.locator('.inkling-footnote-ref')).toHaveText('1')
    await expect(definitionRows(page).nth(0).locator('[data-inkling-footnote-definition-index]')).toHaveText('1.')
    await expect(definitionRows(page).nth(0)).toContainText('Beta')
  })
})
