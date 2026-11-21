// @vitest-environment happy-dom

import type { AuditLogItemDto } from '@kobato/api/contracts/audit'

import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { AuditLogRow } from '@kobato/web-admin/ui/audit/AuditLogRow'
import { BlogSettingsProvider } from '@kobato/web-client/settings/blog-settings-context'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function makeRow(overrides: Partial<AuditLogItemDto> = {}): AuditLogItemDto {
  return {
    id: '1',
    action: 'login',
    actorId: 'user-1',
    actorName: '雨帆',
    actorRole: 'admin',
    resourceType: 'session',
    resourceId: null,
    details: { note: 'x' },
    detailsHtml: null,
    ipAddressMasked: '203.0.113.*',
    userAgentMasked: null,
    createdAt: '2024-01-15T02:30:00.000Z',
    ...overrides,
  }
}

describe('AuditLogRow details sanitisation', () => {
  it('strips active content from detailsHtml but keeps shiki markup', () => {
    const row = makeRow({
      detailsHtml:
        '<pre><code><span style="color:#f00">const x = 1</span></code></pre>' +
        '<script>alert(1)</script><img src="x" onerror="alert(2)">',
    })
    render(
      wrapWithI18n(
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
          <AuditLogRow row={row} />
        </BlogSettingsProvider>,
      ),
    )
    fireEvent.click(screen.getByRole('button'))

    const panel = document.querySelector('[class*="[&>pre]"]')
    expect(panel).not.toBeNull()
    expect(panel!.innerHTML).toContain('<span style="color: #f00">const x = 1</span>')
    expect(panel!.innerHTML).not.toContain('<script')
    expect(panel!.innerHTML).not.toContain('onerror')
    expect(panel!.innerHTML).not.toContain('src=')
  })
})

describe('AuditLogRow localized vocabulary', () => {
  function renderRow(locale: 'zh-CN' | 'en-US', row: AuditLogItemDto) {
    return render(
      wrapWithI18n(
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
          <AuditLogRow row={row} />
        </BlogSettingsProvider>,
        { locale },
      ),
    )
  }

  it('renders the zh-CN action, resource and expand affordances', () => {
    renderRow('zh-CN', makeRow({ action: 'post_published', resourceType: 'post' }))
    expect(screen.getByText('文章发布')).toBeTruthy()
    expect(screen.getByText('文章')).toBeTruthy()
    expect(screen.getByLabelText('展开详情')).toBeTruthy()
    expect(screen.getByText(/IP:\s*203\.0\.113\.\*/)).toBeTruthy()
  })

  it('renders the en-US action, resource and expand affordances', () => {
    renderRow('en-US', makeRow({ action: 'post_published', resourceType: 'post' }))
    expect(screen.getByText('Post published')).toBeTruthy()
    expect(screen.getByText('Post')).toBeTruthy()
    expect(screen.getByLabelText('Expand details')).toBeTruthy()
    expect(screen.getByText(/IP:\s*203\.0\.113\.\*/)).toBeTruthy()
  })
})
