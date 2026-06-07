import { describe, expect, it } from 'vitest'

import { renderInRouter } from '#/_helpers/render'
import { BaseLayout } from '@/ui/public/chrome/BaseLayout'

const adminUser = { id: '1', name: 'admin', role: 'admin' as const }

describe('snapshot: BaseLayout shell', () => {
  it('renders the default chrome (footer on, anonymous)', () => {
    const html = renderInRouter(
      <BaseLayout currentUser={null} pathname="/" search="">
        <div className="page-body">page body</div>
      </BaseLayout>,
      '/',
    )
    expect(html).toContain('page body')
    expect(html).toContain('href="/"')
    expect(html).toContain('首页')
    expect(html).toMatch(/<footer[^>]*>/u)
  })

  it('renders without the footer when explicitly disabled (page detail)', () => {
    const html = renderInRouter(
      <BaseLayout currentUser={null} footer={false} pathname="/about" search="">
        <div className="page-body">about body</div>
      </BaseLayout>,
      '/about',
    )
    expect(html).toContain('about body')
    expect(html).not.toMatch(/<footer[^>]*>/u)
  })

  it('renders the admin variant of the chrome', () => {
    const html = renderInRouter(
      <BaseLayout currentUser={adminUser} pathname="/posts/hello" search="">
        <div className="page-body">post body</div>
      </BaseLayout>,
      '/posts/hello',
    )
    expect(html).toContain('post body')
    expect(html).toContain('用户菜单')
  })
})
