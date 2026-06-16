import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { TableBlock } from '@/shared/pt/schema'

import { TableBlockComponent } from '@/ui/pt/render-blocks'

describe('security / tabnabbing — render-blocks inline link rel on target="_blank"', () => {
  function tableWithLink(markDefs: TableBlock['rows'][number]['cells'][number]['markDefs']): TableBlock {
    return {
      _type: 'table',
      _key: 'tbl1',
      rows: [
        {
          _type: 'tableRow',
          _key: 'r1',
          cells: [
            {
              _type: 'tableCell',
              _key: 'r1c1',
              content: [{ _type: 'span', _key: 's', text: 'site', marks: ['lk'] }],
              markDefs,
            },
          ],
        },
      ],
    }
  }

  it('adds noopener noreferrer when target is _blank', () => {
    const html = renderToStaticMarkup(
      createElement(TableBlockComponent, {
        value: tableWithLink([{ _type: 'link', _key: 'lk', href: 'https://example.com', target: '_blank' }]),
      } as React.ComponentProps<typeof TableBlockComponent>),
    )
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('merges noopener noreferrer into existing rel', () => {
    const html = renderToStaticMarkup(
      createElement(TableBlockComponent, {
        value: tableWithLink([
          { _type: 'link', _key: 'lk', href: 'https://example.com', rel: 'nofollow', target: '_blank' },
        ]),
      } as React.ComponentProps<typeof TableBlockComponent>),
    )
    expect(html).toMatch(/rel="[^"]*noopener[^"]*"/)
    expect(html).toMatch(/rel="[^"]*noreferrer[^"]*"/)
    expect(html).toMatch(/rel="[^"]*nofollow[^"]*"/)
  })

  it('preserves existing rel when target is not _blank', () => {
    const html = renderToStaticMarkup(
      createElement(TableBlockComponent, {
        value: tableWithLink([{ _type: 'link', _key: 'lk', href: 'https://example.com', rel: 'nofollow' }]),
      } as React.ComponentProps<typeof TableBlockComponent>),
    )
    expect(html).toContain('rel="nofollow"')
  })
})
