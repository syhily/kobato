import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { SearchBar, SearchIconButton } from '@/ui/public/Search'

// First snapshot coverage for the public Search: SearchBar renders the
// sidebar form; SearchIconButton's popup is portal-based and returns null under SSR.

describe('snapshot: Search branches', () => {
  it('renders the sidebar search bar', () => {
    const html = stableHtml(renderInRouter(<SearchBar />, '/'))
    expect(html).toContain('id="search"')
    expect(html).toContain('id="sidebar-search-input"')
    expect(html).toContain('文章寻踪')
    expect(html).toContain('placeholder="文章寻踪（输入后回车）"')
    expect(html).toContain('action="/search"')
  })

  it('renders the header search icon button without the client-only popup', () => {
    const html = stableHtml(renderInRouter(<SearchIconButton />, '/'))
    expect(html).toContain('aria-label="打开搜索"')
    expect(html).toContain('title="搜索"')
    expect(html).toContain('lucide-search')
    // The Popup portal is skipped during SSR.
    expect(html).not.toContain('role="dialog"')
  })
})
