import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { renderToHtml } from '@kobato/test/render.tsx'
import { CategoryField } from '@kobato/web-admin/ui/posts/meta/CategoryField.tsx'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
