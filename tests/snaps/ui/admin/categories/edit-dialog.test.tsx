import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { AdminCategoryDto } from '@/shared/contracts/categories'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderToHtml, stableHtml } from '#/_helpers/render'
import { EditCategoryDialog } from '@/ui/admin/categories/EditCategoryDialog'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = { isPending: false, mutate: vi.fn() }

// useMutation is stubbed via a hoisted singleton so the pending and error
// branches are reachable per-test. categories.test.tsx covers the base
// create/edit paths; this file adds the pending branch.

// The stubbed dialog renders inline (the real portal never mounts under SSR);
// open = category !== undefined.
vi.mock('@/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))

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

// Flips category from undefined (closed) to the target on first render so the dialog mounts.
function OpenDialog({ category }: { category: AdminCategoryDto | null }) {
  const [target, setTarget] = useState<AdminCategoryDto | null | undefined>(undefined)
  if (target === undefined) {
    setTarget(category)
  }
  return <EditCategoryDialog category={target} onClose={() => {}} onSaved={() => {}} />
}

describe('snapshot: EditCategoryDialog (extra branches)', () => {
  it('renders the 保存中… submit copy while the upsert mutation is pending', () => {
    queryMocks.mutation.isPending = true
    try {
      const html = stableHtml(renderToHtml(<OpenDialog category={null} />))
      expect(html).toContain('新增分类')
      expect(html).toContain('保存中…')
      expect(html).toContain('disabled=""')
    } finally {
      queryMocks.mutation.isPending = false
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
    expect(html).toContain('编辑分类')
    expect(html).toContain('修改分类的展示信息；文章通过 id 关联分类，重命名后所有引用自动生效。')
    // Input values hydrate on a second render pass that renderToString skips — assert the static submit label instead.
    expect(html).toContain('保存')
    // Cover upload disabled until a safe slug is present.
    expect(html).toContain('请先填写 slug / host 后再上传')
    expect(html).toContain('仅允许小写字母、数字、短横线')
  })

  it('renders the create-mode description copy and the 创建 submit label', () => {
    const html = stableHtml(renderToHtml(<OpenDialog category={null} />))
    expect(html).toContain('填写新分类的名称、URL slug 与展示封面。')
    expect(html).toContain('创建')
    // Empty draft → no stale OG value leaks.
    expect(html).not.toContain('value="/images/og/')
  })
})
