import type { AdminTagDto } from '@kobato/contracts/tags.ts'

import { makeAdminTag } from '@kobato/test/catalog.ts'
import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { renderToHtml, stableHtml } from '@kobato/test/render.tsx'
import { EditTagDialog } from '@kobato/web-admin/ui/tags/EditTagDialog.tsx'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = { mutate: vi.fn(), isPending: false }

vi.mock('@kobato/ui/components/dialog.tsx', () => import('@kobato/test/stubs/dialog.tsx'))

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
