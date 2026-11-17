// @vitest-environment happy-dom

import type { AuditLogItemDto } from '@kobato/shared/contracts/audit.ts'

import { BlogSettingsProvider } from '@kobato/shared/lib/blog-config-context.tsx'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test-helpers/blog-settings.ts'
import { wrapWithI18n } from '@kobato/test-helpers/i18n-render.tsx'
import { AuditLogRow } from '@kobato/web/ui/admin/audit/AuditLogRow.tsx'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

// The audit detail panel must pass detailsHtml through
// sanitizeHtml (src/ui/AGENTS.md convention) — the producer escapes
// today, but the client keeps its own seatbelt.

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
    // Legitimate shiki output (inline styles) survives — spelled the way the
    // browser engine serializes it (byte parity, see sanitize-html-parity).
    expect(panel!.innerHTML).toContain('<span style="color: #f00">const x = 1</span>')
    // …while active content is gone — neither tag nor attribute survives.
    expect(panel!.innerHTML).not.toContain('<script')
    expect(panel!.innerHTML).not.toContain('onerror')
    // The shiki strategy allows a bare <img> but strips its attributes.
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
