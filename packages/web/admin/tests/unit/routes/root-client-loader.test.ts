import type { ContentBootstrapOutput } from '@kobato/api/contracts/public/content'

import { setCsrfToken } from '@kobato/api/browser/client'
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

const { orpc } = await import('@kobato/api/browser/client')

function bootstrapStub(overrides: Partial<ContentBootstrapOutput> = {}): ContentBootstrapOutput {
  return {
    admin: false,
    currentUser: null,
    blogSettings: null,
    fonts: null,
    theme: null,
    csrfToken: 'root-loader-csrf-token',
    rum: null,
    installState: 'installed',
    i18n: { locale: 'en-US', revision: 'root-loader-test', messages: {} },
    ...overrides,
  } as ContentBootstrapOutput
}

async function importRoot() {
  return import('@kobato/web-admin/root')
}

type RootClientLoaderArgs = Parameters<Awaited<ReturnType<typeof importRoot>>['clientLoader']>[0]

function loaderArgs(path: string): RootClientLoaderArgs {
  return {
    request: new Request(`http://localhost${path}`),
    params: {},
    context: undefined,
    serverLoader: () => Promise.resolve(),
  } as unknown as RootClientLoaderArgs
}

describe('root clientLoader', () => {
  it('returns the bootstrap shape minus the server-only fields', async () => {
    vi.mocked(orpc.public.content.bootstrap).mockResolvedValue(bootstrapStub())
    const { clientLoader } = await importRoot()

    const result = await clientLoader(loaderArgs('/admin'))

    expect(result).toStrictEqual({
      admin: false,
      currentUser: null,
      blogSettings: null,
      fonts: null,
      theme: null,
      csrfToken: 'root-loader-csrf-token',
      installState: 'installed',
      i18n: { locale: 'en-US', revision: 'root-loader-test', messages: {} },
    })
    expect(vi.mocked(setCsrfToken)).toHaveBeenCalledWith('root-loader-csrf-token')
  })

  it('redirects to /admin/setup with 303 while no admin exists', async () => {
    vi.mocked(orpc.public.content.bootstrap).mockResolvedValue(bootstrapStub({ installState: 'noAdmin' }))
    const { clientLoader } = await importRoot()

    await expect(clientLoader(loaderArgs('/admin/signin'))).rejects.toMatchObject({
      status: 303,
      headers: { get: expect.any(Function) },
    })
    try {
      await clientLoader(loaderArgs('/admin/signin'))
    } catch (error) {
      expect((error as Response).status).toBe(303)
      expect((error as Response).headers.get('Location')).toBe('/admin/setup')
    }
  })

  it('stays on /admin/setup without redirecting while no admin exists', async () => {
    vi.mocked(orpc.public.content.bootstrap).mockResolvedValue(bootstrapStub({ installState: 'noAdmin' }))
    const { clientLoader } = await importRoot()

    const result = await clientLoader(loaderArgs('/admin/setup'))

    expect(result).toMatchObject({ installState: 'noAdmin', csrfToken: 'root-loader-csrf-token' })
    expect(vi.mocked(setCsrfToken)).toHaveBeenCalledWith('root-loader-csrf-token')
  })

  it('issues ONE bootstrap for concurrent callers through the shared memo', async () => {
    const waiters: Array<(value: ContentBootstrapOutput) => void> = []
    vi.mocked(orpc.public.content.bootstrap).mockImplementation(
      () =>
        new Promise<ContentBootstrapOutput>((resolve) => {
          waiters.push(resolve)
        }),
    )
    const { clientLoader } = await importRoot()
    const { loadRootBootstrap } = await import('@kobato/web-admin/lib/root-bootstrap')

    const first = clientLoader(loaderArgs('/admin'))
    const second = loadRootBootstrap()
    expect(vi.mocked(orpc.public.content.bootstrap)).toHaveBeenCalledTimes(1)
    for (const resolve of waiters) {
      resolve(bootstrapStub())
    }
    await Promise.all([first, second])
    expect(vi.mocked(orpc.public.content.bootstrap)).toHaveBeenCalledTimes(1)
  })

  it('re-freshens the root data on a later navigation through the same memoized call the children use', async () => {
    vi.mocked(orpc.public.content.bootstrap).mockResolvedValueOnce(
      bootstrapStub({ theme: 'light', csrfToken: 'first-navigation' }),
    )
    const { clientLoader } = await importRoot()
    const { awaitRootBootstrap } = await import('@kobato/web-admin/lib/root-bootstrap')

    const first = await clientLoader(loaderArgs('/admin'))
    expect(first.theme).toBe('light')
    expect(first.csrfToken).toBe('first-navigation')

    vi.mocked(orpc.public.content.bootstrap).mockResolvedValue(
      bootstrapStub({ theme: 'dark', csrfToken: 'second-navigation' }),
    )
    const navigation = clientLoader(loaderArgs('/admin/dashboard'))
    const child = awaitRootBootstrap()
    expect(vi.mocked(orpc.public.content.bootstrap)).toHaveBeenCalledTimes(2)

    const data = await navigation
    const childBoot = await child
    expect(data.theme).toBe('dark')
    expect(data.csrfToken).toBe('second-navigation')
    expect({ theme: childBoot.theme, csrfToken: childBoot.csrfToken }).toStrictEqual({
      theme: data.theme,
      csrfToken: data.csrfToken,
    })
    expect(vi.mocked(orpc.public.content.bootstrap)).toHaveBeenCalledTimes(2)
  })
})
