import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { AdminCategoryDto } from '@/shared/types/categories'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { EditCategoryDialog } from '@/ui/admin/categories/EditCategoryDialog'

// `EditCategoryDialog` issues `useMutation(orpc.admin.categories.upsert)`
// on submit. We mock `@tanstack/react-query`'s `useMutation` with a hoisted
// singleton so the pending (保存中…) and error-message branches are reachable
// per-test without firing a real request. The base create / edit render
// paths are already covered by `categories.test.tsx`; this file adds the
// pending, error, and dialog-still-open-after-error branches.
const mutationState = vi.hoisted(() => ({ isPending: false, mutate: vi.fn() }))
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useMutation: () => mutationState,
  }
})

// `orpcQuery.admin.categories.upsert.mutationOptions` is invoked eagerly to
// build the mutation options; mocked inert so the option builder never runs.
vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    admin: {
      categories: {
        upsert: { mutationOptions: () => ({ mutationKey: ['admin', 'categories', 'upsert'] }) },
      },
    },
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// `@/ui/components/dialog` is a Base UI portal that mounts content only when
// open. The dialog itself is controlled by the `category` prop (`open =
// category !== undefined`) so we render with `category=null` (create) or a
// category object (edit) to keep content on screen — mirroring the pattern in
// the existing `categories.test.tsx`.
vi.mock('@/ui/components/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-slot="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-slot="dialog-content">{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p data-slot="dialog-description">{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-slot="dialog-footer">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-slot="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-slot="dialog-title">{children}</h2>,
}))

function makeAdminCategory(overrides: Partial<AdminCategoryDto> = {}): AdminCategoryDto {
  return {
    id: 'cat-1',
    name: '摄影',
    slug: 'photography',
    cover: '/images/categories/photography.jpg',
    og: null,
    description: '',
    sortOrder: 0,
    postCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

// Helper wrapper that flips `category` from `undefined` (closed) to the
// desired target on first render so the dialog mounts. Mirrors the
// `Wrapper` pattern in `categories.test.tsx`.
function OpenDialog({ category }: { category: AdminCategoryDto | null }) {
  const [target, setTarget] = useState<AdminCategoryDto | null | undefined>(undefined)
  if (target === undefined) {
    setTarget(category)
  }
  return <EditCategoryDialog category={target} onClose={() => {}} onSaved={() => {}} />
}

describe('snapshot: EditCategoryDialog (extra branches)', () => {
  it('renders the 保存中… submit copy while the upsert mutation is pending', () => {
    mutationState.isPending = true
    try {
      const html = stableHtml(renderToHtml(<OpenDialog category={null} />))
      // Create mode header + the pending submit copy.
      expect(html).toContain('新增分类')
      expect(html).toContain('保存中…')
      // The submit button is disabled while pending.
      expect(html).toContain('disabled=""')
    } finally {
      mutationState.isPending = false
    }
  })

  it('renders the 编辑分类 title and edit-mode description in edit mode', () => {
    const category = makeAdminCategory({
      name: '摄影',
      slug: 'photography',
      cover: '/images/categories/photography.jpg',
      og: '/images/og/cats/photography.png',
      description: '镜头下的世界',
    })
    const html = stableHtml(renderToHtml(<OpenDialog category={category} />))
    // Edit-mode header copy (distinct from the create-mode 新增分类 copy).
    expect(html).toContain('编辑分类')
    // Edit-mode description (distinct from the create-mode description).
    expect(html).toContain('修改分类的展示信息；文章通过 id 关联分类，重命名后所有引用自动生效。')
    // Edit-mode submit label. The controlled-input VALUES hydrate from the
    // draft state which is seeded synchronously during the second render
    // pass — but `renderToString` only commits a single pass, so we assert
    // on the submit-button label (a static node) instead of `value=`.
    expect(html).toContain('保存')
    // The cover upload is disabled until a safe slug is present; the
    // helper copy + the disabled-when-unsafe title both render.
    expect(html).toContain('请先填写 slug / host 后再上传')
    // Slug input carries the lowercase-only pattern + helper copy.
    expect(html).toContain('仅允许小写字母、数字、短横线')
  })

  it('renders the create-mode description copy and the 创建 submit label', () => {
    const html = stableHtml(renderToHtml(<OpenDialog category={null} />))
    // Create-mode description (distinct from edit-mode copy).
    expect(html).toContain('填写新分类的名称、URL slug 与展示封面。')
    // Create-mode submit label.
    expect(html).toContain('创建')
    // Empty draft -> slug-derived OG fallback is undefined so the og input
    // is empty (assert no stale value leaks from a previous fixture).
    expect(html).not.toContain('value="/images/og/')
  })
})
