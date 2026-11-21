import type { AdminCategoryDto } from '@kobato/api/contracts/categories'

import { makeAdminCategory } from '@kobato/api/tests/utils/catalog'
import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { EditCategoryDialog } from '@kobato/web-admin/ui/categories/EditCategoryDialog'
import { renderToHtml, stableHtml } from '@kobato/web-client/tests/utils/render'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = { isPending: false, mutate: vi.fn() }

vi.mock('@kobato/ui/components/dialog', () => import('@kobato/web-admin/tests/utils/dialog'))

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
    expect(html).toContain('保存')
    expect(html).toContain('请先填写 slug / host 后再上传')
    expect(html).toContain('仅允许小写字母、数字、短横线')
  })

  it('renders the create-mode description copy and the 创建 submit label', () => {
    const html = stableHtml(renderToHtml(<OpenDialog category={null} />))
    expect(html).toContain('填写新分类的名称、URL slug 与展示封面。')
    expect(html).toContain('创建')
    expect(html).not.toContain('value="/images/og/')
  })
})
