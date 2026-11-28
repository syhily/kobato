import type { ContentBootstrapOutput } from '@kobato/api/contracts/public/content'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/api/browser/client', () => ({
  orpc: {
    public: {
      content: {
        bootstrap: vi.fn(),
      },
    },
  },
  setCsrfToken: vi.fn(),
}))

const { orpc: stub } = await import('@kobato/api/browser/client')
const { guardLoader } = await import('@/lib/guard-loader')

function bootWith(role: ContentBootstrapOutput['currentUser']): ContentBootstrapOutput {
  return {
    admin: role?.role === 'admin',
    currentUser: role,
    blogSettings: null,
    fonts: null,
    theme: null,
    csrfToken: 'guard-csrf',
    rum: null,
    installState: 'installed',
    i18n: { locale: 'en-US', revision: 'guard-test', messages: {} },
  } as ContentBootstrapOutput
}

function memoResolved(boot: ContentBootstrapOutput): void {
  vi.mocked(stub.public.content.bootstrap).mockResolvedValue(boot)
}

async function catchThrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the guard to throw')
}

describe('guardLoader', () => {
  it('redirects an anonymous viewer to signin with the request path as redirect_to', async () => {
    memoResolved(bootWith(null))
    const guard = guardLoader('admin')

    const thrown = await catchThrown(guard({ request: new Request('http://localhost/admin/comments') }))

    expect((thrown as Response).status).toBe(302)
    expect((thrown as Response).headers.get('Location')).toBe(
      `/admin/signin?redirect_to=${encodeURIComponent('/admin/comments')}`,
    )
  })

  it('answers 403 for a signed-in viewer below the required role', async () => {
    memoResolved(bootWith({ id: 'u1', name: 'V', email: 'v@example.com', role: 'visitor' }))
    const guard = guardLoader('admin')

    const thrown = await catchThrown(guard({ request: new Request('http://localhost/admin/comments') }))

    expect((thrown as { init?: { status?: number } }).init?.status).toBe(403)
  })

  it('resolves null when the role is sufficient', async () => {
    memoResolved(bootWith({ id: 'u1', name: 'A', email: 'a@example.com', role: 'admin' }))
    const guard = guardLoader('author')

    await expect(guard({ request: new Request('http://localhost/admin/posts') })).resolves.toBeNull()
  })
})
