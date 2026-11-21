import { renderInRouter } from '@kobato/web-client/tests/utils/render.tsx'
import { SearchBar } from '@kobato/web-public/ui/Search.tsx'
import { describe, expect, it } from 'vitest'

describe('snapshot: SearchBar widget', () => {
  it('renders the sidebar search input', () => {
    const html = renderInRouter(<SearchBar />)
    expect(html).toContain('<form')
    expect(html).toContain('type="search"')
    expect(html).toContain('文章寻踪')
  })
})
