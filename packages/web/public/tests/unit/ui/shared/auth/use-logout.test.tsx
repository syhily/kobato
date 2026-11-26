// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { rootData, logoutMock, setCsrfTokenMock } = vi.hoisted(() => ({
  rootData: { current: undefined as { csrfToken?: string } | undefined },
  logoutMock: vi.fn(),
  setCsrfTokenMock: vi.fn(),
}))

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useRouteLoaderData: () => rootData.current,
}))

vi.mock('@kobato/api/browser/client', () => ({
  orpc: { account: { auth: { logout: (...args: unknown[]) => logoutMock(...args) } } },
  setCsrfToken: (...args: unknown[]) => setCsrfTokenMock(...args),
}))

const { useLogout } = await import('@kobato/web-public/ui/shared/auth/use-logout')

const assignMock = vi.fn()
Object.defineProperty(window.location, 'assign', { configurable: true, writable: true, value: assignMock })

afterEach(() => {
  rootData.current = undefined
  logoutMock.mockReset()
  setCsrfTokenMock.mockReset()
  assignMock.mockReset()
  vi.unstubAllGlobals()
})

describe('ui/shared/auth/useLogout', () => {
  it('calls account.auth.logout and navigates to the server-sanitized target', async () => {
    rootData.current = { csrfToken: 'root-csrf-token' }
    logoutMock.mockResolvedValue({ type: 'redirect', to: '/admin' })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useLogout())
    await result.current('https://evil.example/phish')

    expect(setCsrfTokenMock).toHaveBeenCalledWith('root-csrf-token')
    expect(setCsrfTokenMock.mock.invocationCallOrder[0]!).toBeLessThan(logoutMock.mock.invocationCallOrder[0]!)
    expect(logoutMock).toHaveBeenCalledWith({ redirectTo: 'https://evil.example/phish' })
    expect(assignMock).toHaveBeenCalledWith('/admin')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still calls the procedure when the root loader has no token yet', async () => {
    rootData.current = undefined
    logoutMock.mockResolvedValue({ type: 'redirect', to: '/' })

    const { result } = renderHook(() => useLogout())
    await result.current('/posts/hello')

    expect(setCsrfTokenMock).not.toHaveBeenCalled()
    expect(logoutMock).toHaveBeenCalledWith({ redirectTo: '/posts/hello' })
    expect(assignMock).toHaveBeenCalledWith('/')
  })

  it('falls back to the requested target when the answer is not a redirect', async () => {
    rootData.current = { csrfToken: 'root-csrf-token' }
    logoutMock.mockResolvedValue({ type: 'error', message: 'nope' })

    const { result } = renderHook(() => useLogout())
    await result.current('/posts/hello')

    expect(assignMock).toHaveBeenCalledWith('/posts/hello')
  })
})
