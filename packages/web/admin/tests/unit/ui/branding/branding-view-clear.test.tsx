// @vitest-environment happy-dom

import type { AssetsLoaderShape } from '@kobato/settings/projection'

import { renderWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { BrandingView } from '@kobato/web-admin/ui/branding/BrandingView'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const revalidate = vi.hoisted(() => vi.fn())

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRevalidator: () => ({ revalidate, state: 'idle' }),
  }
})

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn() })
  return { toast, Toaster: () => null }
})

import { toast } from 'sonner'
const toastMock = vi.mocked(toast)

const api = vi.hoisted(() => ({
  clear: vi.fn(),
}))

const apiClientMod = await import('@kobato/api/browser/client')
vi.spyOn(apiClientMod, 'orpc', 'get').mockImplementation(
  () =>
    ({
      admin: {
        branding: {
          clear: (input: unknown) => api.clear(input),
        },
      },
    }) as never,
)

afterAll(() => {
  vi.restoreAllMocks()
})

function buildBranding(overrides: Partial<AssetsLoaderShape['branding']>): AssetsLoaderShape['branding'] {
  const base: AssetsLoaderShape['branding'] = {
    faviconSvg: { etag: '' },
    faviconIco: { etag: '' },
    appleTouchIcon: { etag: '' },
    icon192: { etag: '' },
    icon512: { etag: '' },
    logoSvg: { etag: '' },
    logoDarkSvg: { etag: '' },
    logoLargeSvg: { etag: '' },
    logoLargeDarkSvg: { etag: '' },
    openGraph: { etag: '' },
    blogPoster: { etag: '' },
    blogPosterDark: { etag: '' },
    defaultAvatar: { etag: '' },
    defaultMusicCover: { etag: '' },
    robotsTxt: '',
  }
  return { ...base, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BrandingView clear over oRPC', () => {
  it('clears a configured slot through admin.branding.clear, toasts, and revalidates', async () => {
    api.clear.mockResolvedValue({ slot: 'logoSvg', success: true })
    renderWithI18n(<BrandingView branding={buildBranding({ logoSvg: { etag: 'sha-1' } })} />)

    fireEvent.click(screen.getByRole('button', { name: '清除' }))

    await waitFor(() => expect(api.clear).toHaveBeenCalledWith({ slot: 'logoSvg' }))
    await waitFor(() => expect(revalidate).toHaveBeenCalled())
    expect(toastMock.success).toHaveBeenCalledWith('Logo SVG（浅色主题） 已清除')
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('toasts the wire error and never revalidates when the clear fails', async () => {
    api.clear.mockRejectedValue(Object.assign(new Error('Unknown brand-asset slot'), { status: 400 }))
    renderWithI18n(<BrandingView branding={buildBranding({ logoSvg: { etag: 'sha-1' } })} />)

    fireEvent.click(screen.getByRole('button', { name: '清除' }))

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('清除失败', { description: 'Unknown brand-asset slot' }),
    )
    expect(revalidate).not.toHaveBeenCalled()
  })
})
