import { describe, expect, it, vi } from 'vitest'

import { bindIncomingRequestSocketInfo, getBuildMode, importBuild } from '@/server/infra/hono/helpers'

describe('bindIncomingRequestSocketInfo', () => {
  it('populates socket info from proxy headers', async () => {
    const middleware = bindIncomingRequestSocketInfo()
    const next = vi.fn().mockResolvedValue(undefined)

    const context = {
      env: {},
      req: {
        raw: {
          headers: new Headers({
            'x-remote-address': '127.0.0.1',
            'x-remote-port': '12345',
            'x-remote-family': 'IPv4',
          }),
        },
      },
    } as any

    await middleware(context, next)

    expect(next).toHaveBeenCalled()
    expect(context.env.server?.incoming?.socket).toEqual({
      remoteAddress: '127.0.0.1',
      remotePort: 12345,
      remoteFamily: 'IPv4',
    })
  })

  it('leaves undefined values when headers are absent', async () => {
    const middleware = bindIncomingRequestSocketInfo()
    const next = vi.fn().mockResolvedValue(undefined)

    const context = {
      env: {},
      req: { raw: { headers: new Headers() } },
    } as any

    await middleware(context, next)

    expect(context.env.server?.incoming?.socket).toEqual({
      remoteAddress: undefined,
      remotePort: undefined,
      remoteFamily: undefined,
    })
  })
})

describe('getBuildMode', () => {
  it('returns development when import.meta.env.DEV is true', () => {
    const original = import.meta.env.DEV
    ;(import.meta.env as any).DEV = true
    try {
      expect(getBuildMode()).toBe('development')
    } finally {
      ;(import.meta.env as any).DEV = original
    }
  })

  it('returns production when import.meta.env.DEV is false', () => {
    const original = import.meta.env.DEV
    ;(import.meta.env as any).DEV = false
    try {
      expect(getBuildMode()).toBe('production')
    } finally {
      ;(import.meta.env as any).DEV = original
    }
  })
})

describe('importBuild', () => {
  it('imports the virtual react-router server-build module', async () => {
    const fakeBuild = { routes: {} }
    vi.doMock('virtual:react-router/server-build', () => fakeBuild)

    const build = await importBuild()
    expect(build).toEqual(fakeBuild)

    vi.doUnmock('virtual:react-router/server-build')
  })
})
