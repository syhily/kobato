import { describe, expect, it } from 'vitest'

import type { MarkdownHeading } from '@/shared/utils/toc'

import { renderToHtml } from '#/_helpers/render'
import { TableOfContents } from '@/ui/public/post/TableOfContents'
import { TocItems } from '@/ui/public/post/TocItems'

const headings: MarkdownHeading[] = [
  { depth: 2, slug: 'intro', text: 'Introduction' },
  { depth: 3, slug: 'background', text: 'Background' },
  { depth: 2, slug: 'details', text: 'Details' },
]

describe('snapshot: TableOfContents', () => {
  it('renders the TOC toggle and drawer when headings are present', () => {
    const html = renderToHtml(<TableOfContents headings={headings} toc="enabled" />)
    expect(html).toContain('文章目录')
    expect(html).toContain('#intro')
    expect(html).toContain('#background')
    expect(html).toContain('#details')
    expect(html).toContain('aria-label="展开文章目录"')
  })

  it('returns nothing when toc is disabled', () => {
    const html = renderToHtml(<TableOfContents headings={headings} toc="disabled" />)
    expect(html).toBe('')
  })

  it('returns nothing when there are no headings', () => {
    const html = renderToHtml(<TableOfContents headings={[]} toc="enabled" />)
    expect(html).toBe('')
  })
})

describe('snapshot: TocItems', () => {
  it('renders nested heading links with indentation', () => {
    const items = [
      {
        depth: 2,
        slug: 'intro',
        text: 'Introduction',
        children: [{ depth: 3, slug: 'background', text: 'Background', children: [] }],
      },
      { depth: 2, slug: 'details', text: 'Details', children: [] },
    ]

    const html = renderToHtml(<TocItems items={items} />)
    expect(html).toContain('Introduction')
    expect(html).toContain('Background')
    expect(html).toContain('Details')
    expect(html).toContain('href="#intro"')
    expect(html).toContain('href="#background"')
    expect(html).toContain('href="#details"')
  })
})
