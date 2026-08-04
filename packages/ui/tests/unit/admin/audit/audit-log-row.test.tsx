// @vitest-environment happy-dom

import type { AuditLogItemDto } from '@kobato/shared/contracts/audit'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

import { BlogSettingsProvider } from '@kobato/shared/lib/blog-config-context'
import { AuditLogRow } from '@kobato/ui/admin/audit/AuditLogRow'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

// P1-17: the audit detail panel must pass detailsHtml through
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
      <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
        <AuditLogRow row={row} />
      </BlogSettingsProvider>,
    )
    fireEvent.click(screen.getByRole('button'))

    const panel = document.querySelector('[class*="[&>pre]"]')
    expect(panel).not.toBeNull()
    // Legitimate shiki output (inline styles) survives…
    expect(panel!.innerHTML).toContain('<span style="color:#f00">const x = 1</span>')
    // …while active content is gone — neither tag nor attribute survives.
    expect(panel!.innerHTML).not.toContain('<script')
    expect(panel!.innerHTML).not.toContain('onerror')
    // The shiki strategy allows a bare <img> but strips its attributes.
    expect(panel!.innerHTML).not.toContain('src=')
  })
})
