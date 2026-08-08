import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminTagDto } from '@/shared/contracts/tags'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderToHtml, stableHtml } from '#/_helpers/render'
import { EditTagDialog } from '@/ui/admin/tags/EditTagDialog'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = { mutate: vi.fn(), isPending: false }

// tags.test.tsx covers closed/create/edit; this adds the pending submit
// labels ("保存中…" / "创建中…") driven via the mocked mutation state.

vi.mock('@/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))

function makeAdminTag(overrides: Partial<AdminTagDto> = {}): AdminTagDto {
  return {
    id: 'tag-1',
    name: '默认标签',
    slug: 'default',
    ogImage: '/images/open-graph.png',
    postCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('snapshot: EditTagDialog branches', () => {
  beforeEach(() => {
    queryMocks.mutation.mutate = vi.fn()
    queryMocks.mutation.isPending = false
  })

  it('renders nothing while closed', () => {
    const html = stableHtml(
      renderToHtml(<EditTagDialog tag={undefined} onClose={() => undefined} onSaved={() => undefined} />),
    )
    expect(html).toBe('')
  })

  it('renders the pending label in create mode', () => {
    queryMocks.mutation.isPending = true
    function Wrapper() {
      const [target, setTarget] = useState<null | undefined>(undefined)
      if (target === undefined) {
        setTarget(null)
      }
      return <EditTagDialog tag={target} onClose={() => undefined} onSaved={() => undefined} />
    }
    const html = stableHtml(renderToHtml(<Wrapper />))
    expect(html).toContain('新增标签')
    expect(html).toContain('保存中…')
  })

  it('renders the pending label in edit mode', () => {
    queryMocks.mutation.isPending = true
    const tag = makeAdminTag({
      name: 'React',
      slug: 'react',
      ogImage: '/images/og/react.png',
    })
    function Wrapper() {
      const [target, setTarget] = useState<AdminTagDto | undefined>(undefined)
      if (target === undefined) {
        setTarget(tag)
      }
      return <EditTagDialog tag={target} onClose={() => undefined} onSaved={() => undefined} />
    }
    const html = stableHtml(renderToHtml(<Wrapper />))
    expect(html).toContain('编辑标签')
    expect(html).toContain('保存中…')
  })
})
