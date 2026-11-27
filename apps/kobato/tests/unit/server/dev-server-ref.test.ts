import { VITE_DEV_SERVER_SLOT } from '@kobato/pack/vite/hono-dev-host'
import { afterEach, describe, expect, it } from 'vitest'

import { getViteDevServer } from '@/server/dev-server-ref'

afterEach(() => {
  Reflect.deleteProperty(globalThis, VITE_DEV_SERVER_SLOT)
})

describe('getViteDevServer', () => {
  it('reads the dev server the shared dev plugin publishes on the globalThis slot', () => {
    const devServer = { httpServer: { id: 'http-server' } }
    Reflect.set(globalThis, VITE_DEV_SERVER_SLOT, devServer)

    expect(getViteDevServer()).toBe(devServer)
  })

  it('answers undefined outside the Vite dev server', () => {
    expect(getViteDevServer()).toBeUndefined()
  })
})
