import type { ContentBootstrapOutput } from '@kobato/api/contracts/public/content'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/api/browser/client', () => ({
  orpc: {
    public: {
      content: {
        bootstrap: vi.fn(),
      },
    },
    account: {
      auth: {
        status: vi.fn(),
      },
    },
    admin: {
      comments: {
        pendingCount: vi.fn(),
      },
      webmentions: {
        pendingCount: vi.fn(),
      },
      users: {
        count: vi.fn(),
      },
    },
  },
  setCsrfToken: vi.fn(),
}))

const { orpc: stub } = await import('@kobato/api/browser/client')

function bootWith(
  currentUser: ContentBootstrapOutput['currentUser'],
  overrides: Partial<ContentBootstrapOutput> = {},
): ContentBootstrapOutput {
  return {
    admin: currentUser?.role === 'admin',
    currentUser,
    blogSettings: null,
    fonts: null,
    theme: null,
    csrfToken: 'layout-csrf',
    rum: null,
    installState: 'installed',
    i18n: { locale: 'en-US', revision: 'layout-guard-test', messages: {} },
    ...overrides,
  } as ContentBootstrapOutput
}

function user(role: 'admin' | 'author' | 'visitor'): NonNullable<ContentBootstrapOutput['currentUser']> {
  return { id: `u-${role}`, name: role, email: `${role}@example.com`, role }
}

async function catchThrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the loader to throw')
}

describe('route-tree guards', () => {
  it('admin layout lets any signed-in viewer through and reads the shell data over orpc', async () => {
    vi.mocked(stub.public.content.bootstrap).mockResolvedValue(
      bootWith(user('admin'), {
        blogSettings: {
          siteIdentity: { title: 'Layout Site' },
        },
      } as Partial<ContentBootstrapOutput> as ContentBootstrapOutput),
    )
    vi.mocked(stub.admin.comments.pendingCount).mockResolvedValue({ all: 2 } as never)
    vi.mocked(stub.admin.webmentions.pendingCount).mockResolvedValue(3 as never)
    vi.mocked(stub.admin.users.count).mockResolvedValue(4 as never)

    const { clientLoader } = await import('@kobato/web-admin/routes/admin/layout')
    const result = await clientLoader({ request: new Request('http://localhost/admin') } as never)

    expect(result).toMatchObject({
      data: {
        currentUser: { id: 'u-admin', role: 'admin' },
        siteTitle: 'Layout Site',
        pendingCommentCount: 2,
        pendingWebmentionCount: 3,
        userCount: 4,
      },
    })
  })

  it('admin layout skips the admin-only counters for an author', async () => {
    vi.mocked(stub.public.content.bootstrap).mockResolvedValue(bootWith(user('author')))

    const { clientLoader } = await import('@kobato/web-admin/routes/admin/layout')
    const result = await clientLoader({ request: new Request('http://localhost/admin') } as never)

    expect(stub.admin.comments.pendingCount).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      data: { pendingCommentCount: 0, pendingWebmentionCount: 0, userCount: 0 },
    })
  })

  it('admin layout redirects an anonymous viewer to signin', async () => {
    vi.mocked(stub.public.content.bootstrap).mockResolvedValue(bootWith(null))

    const { clientLoader } = await import('@kobato/web-admin/routes/admin/layout')
    const thrown = await catchThrown(clientLoader({ request: new Request('http://localhost/admin/posts') } as never))

    expect((thrown as Response).status).toBe(302)
    expect((thrown as Response).headers.get('Location')).toBe(
      `/admin/signin?redirect_to=${encodeURIComponent('/admin/posts')}`,
    )
  })

  it('editor layout exposes the bootstrap user for an author', async () => {
    vi.mocked(stub.public.content.bootstrap).mockResolvedValue(bootWith(user('author')))

    const { clientLoader } = await import('@kobato/web-admin/routes/editor/layout')
    const result = await clientLoader({ request: new Request('http://localhost/editor/post/new') } as never)

    expect(result).toMatchObject({ data: { currentUser: { id: 'u-author', role: 'author' } } })
  })

  it('auth signin stays reachable for an anonymous viewer and passes install state through', async () => {
    vi.mocked(stub.public.content.bootstrap).mockResolvedValue(bootWith(null))
    vi.mocked(stub.account.auth.status).mockResolvedValue({
      kind: 'view',
      redirectTo: '/',
      action: 'login',
      tokenError: null,
      resetToken: null,
      magicToken: null,
      authError: null,
      csrfToken: null,
    } as never)

    const { clientLoader } = await import('@kobato/web-admin/routes/auth/signin')
    const result = await clientLoader({ request: new Request('http://localhost/admin/signin') } as never)

    expect(result).toMatchObject({
      data: { action: 'login', redirectTo: '/' },
    })
    expect(stub.public.content.bootstrap).toHaveBeenCalledTimes(1)
  })

  it('auth setup redirects to signin once installed', async () => {
    vi.mocked(stub.public.content.bootstrap).mockResolvedValue(bootWith(null))

    const { clientLoader } = await import('@kobato/web-admin/routes/auth/setup/index')
    const thrown = await catchThrown(clientLoader())

    expect((thrown as Response).status).toBe(303)
    expect((thrown as Response).headers.get('Location')).toBe('/admin/signin')
  })
})
