import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderToHtml } from '#/_helpers/render'
import { CategoryField } from '@/ui/admin/posts/meta/CategoryField'

// CategoryField renders the post-editor category select. Base UI's
// `<Select.Value>` renders the raw `value` by default — this component
// resolves the category name via the SelectValue children function, so the
// trigger must show "技术" for id "1", never the id itself (regression:
// the trigger displayed the numeric id).

const queryMocks = mockTanstackQuery()

const CATEGORIES = [{ id: '1', name: '技术' }]

beforeEach(() => {
  queryMocks.query = { data: { categories: CATEGORIES }, isLoading: false }
})

describe('CategoryField select value label', () => {
  it('renders the category name for a selected category id', () => {
    const html = renderToHtml(<CategoryField value="1" onChange={vi.fn()} />)
    expect(html).toContain('data-slot="select-value">技术</span>')
    expect(html).not.toContain('data-slot="select-value">1</span>')
  })

  it('renders the placeholder for an empty value', () => {
    const html = renderToHtml(<CategoryField value="" onChange={vi.fn()} />)
    expect(html).toContain('data-slot="select-value">— 无分类 —</span>')
  })

  it('renders the placeholder for an unknown category id', () => {
    const html = renderToHtml(<CategoryField value="999" onChange={vi.fn()} />)
    expect(html).toContain('data-slot="select-value">— 无分类 —</span>')
  })
})
