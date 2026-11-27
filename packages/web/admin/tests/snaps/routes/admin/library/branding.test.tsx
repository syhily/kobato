import { asRoute } from '@kobato/test/route-test-utils'
import BrandingRoute from '@kobato/web-admin/routes/admin/library/branding'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRevalidator: () => ({ revalidate: vi.fn(), state: 'idle' }),
  }
})

describe('snapshot: routes/admin/library/branding', () => {
  it('renders the branding route', () => {
    const Route = asRoute(BrandingRoute)
    const html = stableHtml(renderInRouter(<Route loaderData={{ branding: null }} />, '/admin/library/branding'))
    expect(html).toContain('品牌素材')
  })
})
