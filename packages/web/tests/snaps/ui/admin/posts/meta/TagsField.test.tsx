import { mockTanstackQuery } from '@kobato/test-helpers/mock-react-query.ts'
import { renderToHtml, stableHtml } from '@kobato/test-helpers/render.tsx'
import { TagsField } from '@kobato/web/ui/admin/posts/meta/TagsField.tsx'
import { describe, expect, it } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: [
    { id: '1', name: 'React' },
    { id: '2', name: 'TypeScript' },
  ],
  isLoading: false,
  error: null,
}

describe('ui/admin/posts/meta/TagsField', () => {
  it('renders the input and existing tag badges', () => {
    const html = stableHtml(renderToHtml(<TagsField values={['React']} onChange={() => undefined} />))
    expect(html).toContain('React')
    expect(html).toContain('输入标签名称，按回车添加')
  })
})
