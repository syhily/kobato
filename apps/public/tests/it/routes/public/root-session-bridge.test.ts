import { makeLoaderArgs } from '#/_helpers/context'

import { SESSION_COOKIE_NAME, SESSION_TOKEN_URL_PARAM } from '@kobato/shared/http/session-bridge'
import { describe, expect, it } from 'vitest'

import { loader } from '@/root'

// Session-bridge intake (headless stage 3): after a member logs in on the
// CORE domain, the signin redirect carries `?session_token=<signed
// __session cookie value>`; the root loader mirrors it into the
// frontend-domain `__session` cookie and redirects to the clean URL.

describe('frontend root loader — session-bridge intake', () => {
  it('mirrors the handoff value into the frontend __session cookie and redirects to the clean URL', async () => {
    const token = 'ImFiYyUyRg.signed-signature'
    const args = makeLoaderArgs({
      request: new Request(`http://localhost/posts/hello?${SESSION_TOKEN_URL_PARAM}=${encodeURIComponent(token)}`),
    })
    const result = (await loader(args)) as Response

    expect(result.status).toBe(302)
    const headers = new Headers(result.headers)
    expect(headers.get('Location')).toBe('/posts/hello')
    const setCookie = headers.get('Set-Cookie') ?? ''
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=${token}`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain(`Max-Age=${60 * 60 * 24 * 14}`)
    // No token leftover in the redirect target.
    expect(headers.get('Location')).not.toContain(SESSION_TOKEN_URL_PARAM)
  })

  it('keeps the other query params when stripping the token', async () => {
    const args = makeLoaderArgs({
      request: new Request(`http://localhost/search/x?${SESSION_TOKEN_URL_PARAM}=tok&theme=dark`),
    })
    const result = (await loader(args)) as Response
    const headers = new Headers(result.headers)
    expect(headers.get('Location')).toBe('/search/x?theme=dark')
  })
})
