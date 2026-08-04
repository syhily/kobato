import { describe, expect, it } from 'vitest'

import { resolveLoginRedirect, toSessionBridgedRedirect } from '@/routes/auth/signin-redirect'

// The cross-domain login handoff (plan v6 §6): the allowlist gate on the
// login redirect target + the signed-session-cookie append. Both are pure
// so the security surface is unit-pinable without the config graph.

const ORIGIN = 'https://core.example.com'
const ALLOWED = ['https://front.example.com']

describe('resolveLoginRedirect', () => {
  it('keeps same-origin targets as path-only (safeRedirectPath semantics)', () => {
    expect(resolveLoginRedirect('/admin/posts', '/admin', ORIGIN, ALLOWED)).toBe('/admin/posts')
    expect(resolveLoginRedirect('https://core.example.com/posts/1?x=1', '/admin', ORIGIN, ALLOWED)).toBe('/posts/1?x=1')
  })

  it('passes an allowed frontend origin through as a full URL', () => {
    expect(resolveLoginRedirect('https://front.example.com/posts/1', '/admin', ORIGIN, ALLOWED)).toBe(
      'https://front.example.com/posts/1',
    )
  })

  it('falls back for a disallowed cross-origin target', () => {
    expect(resolveLoginRedirect('https://evil.example.com/phish', '/admin', ORIGIN, ALLOWED)).toBe('/admin')
    expect(resolveLoginRedirect('javascript:alert(1)', '/admin', ORIGIN, ALLOWED)).toBe('/admin')
    expect(resolveLoginRedirect('', '/admin', ORIGIN, ALLOWED)).toBe('/admin')
    expect(resolveLoginRedirect(null, '/admin', ORIGIN, ALLOWED)).toBe('/admin')
  })
})

describe('toSessionBridgedRedirect', () => {
  const setCookie = '__session=ImFiYyUyRg.signed; Path=/; SameSite=Lax; HttpOnly; Max-Age=1209600'

  it('appends the signed session value to an allowed frontend-origin redirect', () => {
    const to = toSessionBridgedRedirect('https://front.example.com/posts/1', setCookie, ORIGIN, ALLOWED)
    const url = new URL(to)
    expect(url.origin).toBe('https://front.example.com')
    expect(url.searchParams.get('session_token')).toBe('ImFiYyUyRg.signed')
  })

  it('preserves the existing query when appending the token', () => {
    const to = toSessionBridgedRedirect('https://front.example.com/posts/1?theme=dark', setCookie, ORIGIN, ALLOWED)
    const url = new URL(to)
    expect(url.searchParams.get('theme')).toBe('dark')
    expect(url.searchParams.get('session_token')).toBe('ImFiYyUyRg.signed')
  })

  it('never touches a disallowed origin', () => {
    expect(toSessionBridgedRedirect('/admin', setCookie, ORIGIN, ALLOWED)).toBe('/admin')
    expect(toSessionBridgedRedirect('https://evil.example.com/x', setCookie, ORIGIN, ALLOWED)).toBe(
      'https://evil.example.com/x',
    )
  })

  it('leaves the redirect alone without a session cookie in the response', () => {
    expect(toSessionBridgedRedirect('https://front.example.com/posts/1', undefined, ORIGIN, ALLOWED)).toBe(
      'https://front.example.com/posts/1',
    )
  })
})
