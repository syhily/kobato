import { makeCategory } from '#/_helpers/catalog'
import { renderInRouter } from '#/_helpers/render'

import { CategoriesBody } from '@kobato/ui/public/post/CategoriesBody'
import { describe, expect, it } from 'vitest'

describe('snapshot: CategoriesBody', () => {
  it('renders the category grid with covers and counts', () => {
    const categories = [
      makeCategory({
        name: '技术',
        slug: 'tech',
        description: 'Programming and infrastructure.',
        counts: 12,
      }),
      makeCategory({
        name: '生活',
        slug: 'life',
        description: 'Daily notes.',
        counts: 5,
      }),
    ]

    const html = renderInRouter(<CategoriesBody title="分类目录" categories={categories} />)
    expect(html).toContain('分类目录')
    expect(html).toContain('技术')
    expect(html).toContain('生活')
    expect(html).toContain('Programming and infrastructure.')
    expect(html).toContain('Daily notes.')
    expect(html).toContain('12 篇文章')
    expect(html).toContain('5 篇文章')
    expect(html).toContain('/cats/tech')
    expect(html).toContain('/cats/life')
    expect(html).toContain('/images/cover.png')
  })

  it('renders an empty category grid', () => {
    const html = renderInRouter(<CategoriesBody title="分类目录" categories={[]} />)
    expect(html).toContain('分类目录')
    expect(html).not.toContain('/cats/')
  })
})
