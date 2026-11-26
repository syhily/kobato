import { renderInRouter } from '@kobato/web-kit/tests/utils/render'
import { SearchBar } from '@kobato/web-public/ui/Search'
import { describe, expect, it } from 'vitest'

describe('snapshot: SearchBar widget', () => {
  it('renders the sidebar search input', () => {
    const html = renderInRouter(<SearchBar />)
    expect(html).toContain('<form')
    expect(html).toContain('type="search"')
    expect(html).toContain('文章寻踪')
  })
})
