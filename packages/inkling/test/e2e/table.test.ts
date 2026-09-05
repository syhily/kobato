import { expect, test, type Page } from '@playwright/test'

import { focusEditor, initialize, loadSerializedState } from '#/utils/e2e'

const cell = (headerState: number, content: string) => ({
  type: 'tablecell',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  headerState,
  colSpan: 1,
  children: [
    {
      type: 'paragraph',
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      children: [{ type: 'text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: content }],
    },
  ],
})

const row = (cells: unknown[]) => ({
  type: 'tablerow',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children: cells,
})

// A serialized 2×2 table; headerState 1 is TableCellHeaderStates.ROW, so the
// first row is the header row.
const TABLE_STATE = JSON.stringify({
  root: {
    children: [
      {
        type: 'table',
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        children: [row([cell(1, 'h1'), cell(1, 'h2')]), row([cell(0, 'a'), cell(0, 'b')])],
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
})

test.describe('Table', () => {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('inserts the default table from the slash menu, then types and tabs across cells', async function () {
    await initialize({ page, uri: '/#/?content=false' })
    await focusEditor(page)

    await page.keyboard.type('/table')
    await page.waitForSelector('[data-inkling-card-menu-item="Table"][data-inkling-cardmenu-selected="true"]')
    await page.keyboard.press('Enter')

    const table = page.locator('.inkling-lexical table')
    await expect(table).toBeVisible()
    await expect(table.locator('tr')).toHaveCount(3)
    // the default insert carries a header row, never a header column
    await expect(table.locator('tr').nth(0).locator('th')).toHaveCount(3)
    await expect(table.locator('tr').nth(0).locator('td')).toHaveCount(0)
    await expect(table.locator('tr').nth(1).locator('td')).toHaveCount(3)

    // the caret lands in the first cell after the insert
    await page.keyboard.type('hello')
    await expect(table.locator('tr').nth(0).locator('th').nth(0)).toHaveText('hello')

    // upstream's selection observer moves the caret to the next cell on Tab
    await page.keyboard.press('Tab')
    await page.keyboard.type('world')
    await expect(table.locator('tr').nth(0).locator('th').nth(1)).toHaveText('world')
  })

  test('header-cell state drives the th/td rendering', async function () {
    await initialize({ page, uri: '/#/?content=false' })

    await loadSerializedState(page, TABLE_STATE)

    const table = page.locator('.inkling-lexical table')
    await expect(table.locator('th')).toHaveCount(2)
    await expect(table.locator('td')).toHaveCount(2)

    // No header-toggle UI ships this chapter; the state flip stands in for it
    // (the GFM round-trip and the HTML export key off the same headerState).
    await page.evaluate((serialized) => {
      const editor = window.lexicalEditor
      const state = JSON.parse(serialized) as {
        root: { children: Array<{ type: string; children?: Array<{ children?: Array<{ headerState?: number }> }> }> }
      }
      const table = state.root.children.find((child) => child.type === 'table')
      for (const headerCell of table?.children?.[0]?.children ?? []) {
        headerCell.headerState = 0
      }
      editor.setEditorState(editor.parseEditorState(JSON.stringify(state)))
    }, TABLE_STATE)

    await expect(table.locator('th')).toHaveCount(0)
    await expect(table.locator('td')).toHaveCount(4)
  })

  test('exports the table as <table> HTML through HtmlOutputPlugin', async function () {
    await initialize({ page, uri: '/#/html-output' })

    await loadSerializedState(page, TABLE_STATE)

    await expect(page.getByTestId('html-output')).toContainText(
      '<table><tr><th>h1</th><th>h2</th></tr><tr><td>a</td><td>b</td></tr></table>',
    )
  })
})
