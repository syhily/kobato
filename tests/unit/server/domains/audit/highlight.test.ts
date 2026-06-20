import { beforeEach, describe, expect, it, vi } from 'vitest'

const codeToHtmlMock = vi.fn<() => string>()
const createHighlighterMock = vi.fn(() =>
  Promise.resolve({
    codeToHtml: codeToHtmlMock,
  }),
)

vi.mock('shiki', () => ({
  createHighlighter: createHighlighterMock,
}))

vi.mock('@/server/infra/rendering/shiki', () => ({
  SHIKI_THEMES: { light: 'solarized-light', dark: 'solarized-dark' },
}))

describe('highlightAuditLogDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    createHighlighterMock.mockResolvedValue({ codeToHtml: codeToHtmlMock })
  })

  it('returns null for null details', async () => {
    const { highlightAuditLogDetails } = await import('@/server/domains/audit/highlight')
    expect(await highlightAuditLogDetails(null)).toBeNull()
    expect(createHighlighterMock).not.toHaveBeenCalled()
  })

  it('highlights JSON details with Shiki', async () => {
    codeToHtmlMock.mockReturnValue('<pre>html</pre>')

    const { highlightAuditLogDetails } = await import('@/server/domains/audit/highlight')
    const result = await highlightAuditLogDetails({ user: 'alice', action: 'login' })

    expect(result).toBe('<pre>html</pre>')
    expect(createHighlighterMock).toHaveBeenCalledWith({
      themes: ['solarized-light', 'solarized-dark'],
      langs: ['json'],
    })
    expect(codeToHtmlMock).toHaveBeenCalledWith(JSON.stringify({ user: 'alice', action: 'login' }, null, 2), {
      lang: 'json',
      themes: { light: 'solarized-light', dark: 'solarized-dark' },
      defaultColor: false,
    })
  })

  it('returns null when Shiki throws', async () => {
    createHighlighterMock.mockRejectedValue(new Error('shiki failed'))

    const { highlightAuditLogDetails } = await import('@/server/domains/audit/highlight')
    const result = await highlightAuditLogDetails({ user: 'alice' })

    expect(result).toBeNull()
  })

  it('shares the highlighter promise across calls', async () => {
    codeToHtmlMock.mockReturnValue('<pre>x</pre>')

    const { highlightAuditLogDetails } = await import('@/server/domains/audit/highlight')
    await highlightAuditLogDetails({ a: 1 })
    await highlightAuditLogDetails({ b: 2 })

    expect(createHighlighterMock).toHaveBeenCalledTimes(1)
    expect(codeToHtmlMock).toHaveBeenCalledTimes(2)
  })
})
