import { renderInRouter, stableHtml } from '@kobato/test-helpers/render.tsx'
import { asRoute } from '@kobato/test-helpers/route-test-utils.tsx'
import { describe, expect, it, vi } from 'vitest'

import BrandingRoute from '@/routes/admin/library/branding'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRevalidator: () => ({ revalidate: vi.fn(), state: 'idle' }),
    useRouteLoaderData: () => ({ csrfToken: 'test-csrf-token' }),
  }
})

describe('snapshot: routes/admin/library/branding', () => {
  it('renders the branding route', () => {
    const Route = asRoute(BrandingRoute)
    const html = stableHtml(renderInRouter(<Route loaderData={{ branding: null }} />, '/admin/library/branding'))
    expect(html).toContain('品牌素材')
  })
})
