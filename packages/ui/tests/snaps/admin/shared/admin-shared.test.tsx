import { renderToHtml, stableHtml } from '#/_helpers/render'

import { AdminListPage } from '@kobato/ui/admin/shared/AdminListPage'
import { AdminPagination } from '@kobato/ui/admin/shared/AdminPagination'
import { ConfirmDialog } from '@kobato/ui/admin/shared/ConfirmDialog'
import { SearchShortcutHint } from '@kobato/ui/admin/shared/SearchShortcutHint'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('snapshot: AdminListPage', () => {
  it('renders header with title and description', () => {
    const html = stableHtml(
      renderToHtml(
        <AdminListPage>
          <AdminListPage.Header title="文章" description="管理已发布与草稿文章。">
            <button type="button">新建</button>
          </AdminListPage.Header>
        </AdminListPage>,
      ),
    )
    expect(html).toContain('文章')
    expect(html).toContain('管理已发布与草稿文章')
    expect(html).toContain('新建')
  })

  it('renders toolbar with filter field', () => {
    const html = stableHtml(
      renderToHtml(
        <AdminListPage>
          <AdminListPage.Toolbar>
            <AdminListPage.FilterField label="状态" action={<button type="button">清除</button>}>
              <select>
                <option>全部</option>
              </select>
            </AdminListPage.FilterField>
          </AdminListPage.Toolbar>
        </AdminListPage>,
      ),
    )
    expect(html).toContain('状态')
    expect(html).toContain('清除')
    expect(html).toContain('全部')
  })

  it('renders page navigation', () => {
    const html = stableHtml(
      renderToHtml(
        <AdminListPage>
          <AdminListPage.PageNavigation totalPages={5} currentPage={2} onChange={() => {}} />
        </AdminListPage>,
      ),
    )
    expect(html).toContain('aria-label="pagination"')
    expect(html).toContain('3')
  })
})

describe('snapshot: AdminPagination', () => {
  it('renders a dense page ladder', () => {
    const html = stableHtml(renderToHtml(<AdminPagination totalPages={5} currentPage={1} onChange={() => {}} />))
    expect(html).toContain('1')
    expect(html).toContain('2')
    expect(html).toContain('5')
    expect(html).toContain('aria-current="page"')
  })

  it('renders an ellipsis window for many pages', () => {
    const html = stableHtml(renderToHtml(<AdminPagination totalPages={20} currentPage={9} onChange={() => {}} />))
    expect(html).toContain('1')
    expect(html).toContain('10')
    expect(html).toContain('20')
  })

  it('renders nothing for a single page', () => {
    const html = stableHtml(renderToHtml(<AdminPagination totalPages={1} currentPage={0} onChange={() => {}} />))
    expect(html).toBe('')
  })
})

describe('snapshot: ConfirmDialog', () => {
  it('renders closed state without state', () => {
    const html = stableHtml(renderToHtml(<ConfirmDialog state={null} onClose={() => {}} />))
    expect(html).toBe('')
  })
})

describe('snapshot: SearchShortcutHint', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders Ctrl K hint on non-Mac platforms', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    const html = stableHtml(renderToHtml(<SearchShortcutHint />))
    expect(html).toContain('Ctrl')
    expect(html).toContain('K')
    expect(html).toContain('快捷键：Ctrl K')
  })

  it('renders the Ctrl K server fallback on Mac platforms', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    const html = stableHtml(renderToHtml(<SearchShortcutHint />))
    expect(html).toContain('Ctrl')
    expect(html).toContain('K')
    expect(html).toContain('快捷键：Ctrl K')
  })
})
