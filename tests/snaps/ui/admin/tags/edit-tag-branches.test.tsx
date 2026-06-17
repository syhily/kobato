import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminTagDto } from '@/shared/types/tags'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { EditTagDialog } from '@/ui/admin/tags/EditTagDialog'

// `EditTagDialog` is already covered by `tags.test.tsx` for the closed /
// create / edit states. This suite adds the remaining render-path branches
// that are controllable through the mocked mutation state:
//   - the submit button label flips to "保存中…" / "创建中…" when pending,
//   - both the create and edit pending label arms are exercised.

const mutationState = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useMutation: () => mutationState,
  }
})

vi.mock('@/ui/components/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-slot="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-slot="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p data-slot="dialog-description">{children}</p>,
  DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-slot="dialog-footer" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-slot="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-slot="dialog-title">{children}</h2>,
}))

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
    mutationState.mutate = vi.fn()
    mutationState.isPending = false
  })

  it('renders nothing while closed', () => {
    const html = stableHtml(
      renderToHtml(<EditTagDialog tag={undefined} onClose={() => undefined} onSaved={() => undefined} />),
    )
    expect(html).toBe('')
  })

  it('renders the pending label in create mode', () => {
    mutationState.isPending = true
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
    mutationState.isPending = true
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
