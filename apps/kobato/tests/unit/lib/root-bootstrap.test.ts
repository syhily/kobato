import type { ContentBootstrapOutput } from '@kobato/api/contracts/public/content'
import type { Role } from '@kobato/base/auth/roles'

import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'
import { describe, expect, it, vi } from 'vitest'

import { awaitRootBootstrap, loadRootBootstrap, requireRoleFromBootstrap } from '@/lib/root-bootstrap'

const bootstrap = vi.hoisted(() => vi.fn())

vi.mock('@kobato/api/browser/client', () => ({
  orpc: { public: { content: { bootstrap } } },
}))

function makeBoot(
  role: Role | null,
  i18n: ContentBootstrapOutput['i18n'] = { locale: 'en-US', revision: 'r1', messages: uiMessagesEnUS },
): ContentBootstrapOutput {
  return {
    admin: role === 'admin',
    currentUser: role === null ? null : { id: 'u1', name: 'U', email: 'u1@example.com', role },
    blogSettings: null,
    fonts: null,
    theme: null,
    csrfToken: 'csrf-token',
    rum: null,
    installState: 'installed',
    i18n,
  }
}

function catchThrown(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('expected the guard to throw')
}

function makeDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('loadRootBootstrap / awaitRootBootstrap', () => {
  it('issues one call shared by the root and children when the root starts first', async () => {
    bootstrap.mockImplementation(() => Promise.resolve(makeBoot('admin')))
    const root = loadRootBootstrap()
    const childA = awaitRootBootstrap()
    const childB = awaitRootBootstrap()
    expect(childA).toBe(root)
    expect(childB).toBe(root)
    await Promise.all([root, childA, childB])
    expect(bootstrap).toHaveBeenCalledTimes(1)
  })

  it('issues one call shared by root and children when a child starts first', async () => {
    const deferred = makeDeferred()
    bootstrap.mockImplementation(() => deferred.promise.then(() => makeBoot('admin')))
    const child = awaitRootBootstrap()
    const root = loadRootBootstrap()
    expect(root).toBe(child)
    deferred.resolve()
    await root
    expect(bootstrap).toHaveBeenCalledTimes(1)
  })

  it('issues a fresh call once the previous bootstrap settled', async () => {
    bootstrap.mockImplementation(() => Promise.resolve(makeBoot('visitor')))
    const first = await loadRootBootstrap()
    expect(first.currentUser?.role).toBe('visitor')
    const second = loadRootBootstrap()
    expect(second).not.toBe(first)
    await second
    expect(bootstrap).toHaveBeenCalledTimes(2)
  })

  it('shares the rejection across root and children, then issues fresh afterwards', async () => {
    bootstrap.mockImplementationOnce(() => Promise.reject(new Error('bootstrap unavailable')))
    const root = loadRootBootstrap()
    const child = awaitRootBootstrap()
    expect(child).toBe(root)
    await expect(root).rejects.toThrow('bootstrap unavailable')
    await expect(child).rejects.toThrow('bootstrap unavailable')
    expect(bootstrap).toHaveBeenCalledTimes(1)

    bootstrap.mockImplementation(() => Promise.resolve(makeBoot('admin')))
    const fresh = await loadRootBootstrap()
    expect(fresh.currentUser?.role).toBe('admin')
    expect(bootstrap).toHaveBeenCalledTimes(2)
  })
})

describe('requireRoleFromBootstrap', () => {
  const pathname = '/admin/security/users/3'

  it('redirects an anonymous viewer to signin with the encoded pathname', () => {
    const thrown = catchThrown(() => requireRoleFromBootstrap(makeBoot(null), 'visitor', { pathname }))
    expect(thrown).toBeInstanceOf(Response)
    const response = thrown as Response
    expect(response.headers.get('Location')).toBe(`/admin/signin?redirect_to=${encodeURIComponent(pathname)}`)
  })

  it('renders the 403 outcome for a viewer below the minimum role, from the bootstrap catalog', () => {
    const thrown = catchThrown(() => requireRoleFromBootstrap(makeBoot('visitor'), 'author', { pathname }))
    const error = thrown as { type?: string; data?: unknown; init?: ResponseInit }
    expect(error.type).toBe('DataWithResponseInit')
    expect(error.data).toBe(uiMessagesEnUS['error.api.forbidden'])
    expect(error.init).toMatchObject({ status: 403 })
  })

  it('localizes the 403 outcome with the bootstrap catalog locale', () => {
    const zh = catchThrown(() =>
      requireRoleFromBootstrap(
        makeBoot('visitor', { locale: 'zh-CN', revision: 'r1', messages: uiMessagesZhCN }),
        'author',
        { pathname },
      ),
    )
    expect((zh as { data?: unknown }).data).toBe(uiMessagesZhCN['error.api.forbidden'])
    const en = catchThrown(() => requireRoleFromBootstrap(makeBoot('visitor'), 'author', { pathname }))
    expect((en as { data?: unknown }).data).toBe(uiMessagesEnUS['error.api.forbidden'])
    expect(uiMessagesEnUS['error.api.forbidden']).not.toBe(uiMessagesZhCN['error.api.forbidden'])
  })

  it('renders the 403 outcome for an author below admin', () => {
    const thrown = catchThrown(() => requireRoleFromBootstrap(makeBoot('author'), 'admin', { pathname }))
    const error = thrown as { init?: ResponseInit }
    expect(error.init).toMatchObject({ status: 403 })
  })

  it('lets a viewer at or above the minimum role through', () => {
    expect(() => requireRoleFromBootstrap(makeBoot('visitor'), 'visitor', { pathname })).not.toThrow()
    expect(() => requireRoleFromBootstrap(makeBoot('author'), 'author', { pathname })).not.toThrow()
    expect(() => requireRoleFromBootstrap(makeBoot('admin'), 'admin', { pathname })).not.toThrow()
    expect(() => requireRoleFromBootstrap(makeBoot('admin'), 'visitor', { pathname })).not.toThrow()
  })
})
