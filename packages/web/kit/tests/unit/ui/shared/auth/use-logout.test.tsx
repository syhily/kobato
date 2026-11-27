// @vitest-environment happy-dom

import type { DocumentFacts } from '@kobato/ui/lib/document-facts-context'
import type { ReactNode } from 'react'

import { DocumentFactsProvider } from '@kobato/ui/lib/document-facts-context'
import { TEST_DOCUMENT_FACTS } from '@kobato/ui/tests/utils/document-facts'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { logoutMock, setCsrfTokenMock } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  setCsrfTokenMock: vi.fn(),
}))

vi.mock('@kobato/api/browser/client', () => ({
  orpc: { account: { auth: { logout: (...args: unknown[]) => logoutMock(...args) } } },
  setCsrfToken: (...args: unknown[]) => setCsrfTokenMock(...args),
}))

const { useLogout } = await import('@kobato/web-kit/ui/shared/auth/use-logout')

const assignMock = vi.fn()
Object.defineProperty(window.location, 'assign', { configurable: true, writable: true, value: assignMock })

function renderLogout(csrfToken: string | undefined) {
  const facts: DocumentFacts = { ...TEST_DOCUMENT_FACTS, csrfToken }
  return renderHook(() => useLogout(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <DocumentFactsProvider value={facts}>{children}</DocumentFactsProvider>
    ),
  })
}

afterEach(() => {
  logoutMock.mockReset()
  setCsrfTokenMock.mockReset()
  assignMock.mockReset()
  vi.unstubAllGlobals()
})

describe('ui/shared/auth/useLogout', () => {
  it('calls account.auth.logout and navigates to the server-sanitized target', async () => {
    logoutMock.mockResolvedValue({ type: 'redirect', to: '/admin' })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderLogout('root-csrf-token')
    await result.current('https://evil.example/phish')

    expect(setCsrfTokenMock).toHaveBeenCalledWith('root-csrf-token')
    expect(setCsrfTokenMock.mock.invocationCallOrder[0]!).toBeLessThan(logoutMock.mock.invocationCallOrder[0]!)
    expect(logoutMock).toHaveBeenCalledWith({ redirectTo: 'https://evil.example/phish' })
    expect(assignMock).toHaveBeenCalledWith('/admin')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still calls the procedure when the document carries no token yet', async () => {
    logoutMock.mockResolvedValue({ type: 'redirect', to: '/' })

    const { result } = renderLogout(undefined)
    await result.current('/posts/hello')

    expect(setCsrfTokenMock).not.toHaveBeenCalled()
    expect(logoutMock).toHaveBeenCalledWith({ redirectTo: '/posts/hello' })
    expect(assignMock).toHaveBeenCalledWith('/')
  })

  it('falls back to the requested target when the answer is not a redirect', async () => {
    logoutMock.mockResolvedValue({ type: 'error', message: 'nope' })

    const { result } = renderLogout('root-csrf-token')
    await result.current('/posts/hello')

    expect(assignMock).toHaveBeenCalledWith('/posts/hello')
  })

  it('never rejects: a failed procedure call still navigates to the requested target', async () => {
    logoutMock.mockRejectedValue(new Error('403 csrf'))

    const { result } = renderLogout('root-csrf-token')
    await expect(result.current('/posts/hello')).resolves.toBeUndefined()

    expect(setCsrfTokenMock).toHaveBeenCalledWith('root-csrf-token')
    expect(assignMock).toHaveBeenCalledWith('/posts/hello')
  })
})
