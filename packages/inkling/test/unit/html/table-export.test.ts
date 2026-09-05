// Both HTML export paths render the table family: LIVE pins
// `$convertToHtmlString` run against an editor configured like
// InklingComposer (DEFAULT_NODES + defaultTheme), exactly as HtmlOutputPlugin
// does; HEADLESS pins the headless HTML surface's default node set
// (DEFAULT_HTML_NODES includes INKLING_TABLE_NODES) — the kobato server-side
// rendering path. One serializer backs both, so each case pins one string
// and asserts the two legs agree byte-exactly.
import { describe, expect, it } from 'vitest'

import { renderHeadless, renderLive } from '#/utils/render-live'

const text = (content: string, format = 0) => ({
  type: 'text',
  version: 1,
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text: content,
})

const paragraph = (children: unknown[]) => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
})

const cell = (headerState: number, children: unknown[]) => ({
  type: 'tablecell',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  headerState,
  colSpan: 1,
  children: [paragraph(children)],
})

const row = (cells: unknown[]) => ({
  type: 'tablerow',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children: cells,
})

const tableDoc = (rows: unknown[]) =>
  JSON.stringify({
    root: {
      children: [
        {
          type: 'table',
          version: 1,
          format: '',
          indent: 0,
          direction: 'ltr',
          children: rows,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  })

describe('table HTML export (live and headless paths)', () => {
  it('emits header cells as <th> and body cells as <td>, flattening the cell paragraph', async () => {
    const state = tableDoc([
      row([cell(1, [text('h1')]), cell(1, [text('h2')])]),
      row([cell(0, [text('a')]), cell(0, [text('b')])]),
    ])
    const expected = '<table><tr><th>h1</th><th>h2</th></tr><tr><td>a</td><td>b</td></tr></table>'

    expect(renderLive(state)).toBe(expected)
    await expect(renderHeadless(state)).resolves.toBe(expected)
  })

  it('keeps inline formats and links inside cells', async () => {
    const state = tableDoc([
      row([
        cell(1, [text('bold', 1)]),
        cell(1, [
          {
            type: 'link',
            version: 1,
            format: '',
            indent: 0,
            direction: 'ltr',
            url: 'https://example.com',
            rel: 'noopener',
            target: null,
            title: null,
            children: [text('a link')],
          },
        ]),
      ]),
    ])
    const expected =
      '<table><tr><th><strong>bold</strong></th><th><a href="https://example.com" rel="noopener">a link</a></th></tr></table>'

    expect(renderLive(state)).toBe(expected)
    await expect(renderHeadless(state)).resolves.toBe(expected)
  })
})
