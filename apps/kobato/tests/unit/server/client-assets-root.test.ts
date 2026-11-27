import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clientAssetsRoot } from '@/server/client-assets-root'

vi.mock('@kobato/server/infra/sea/sea', () => ({
  seaVfsRoot: vi.fn(() => null),
}))

const { seaVfsRoot } = await import('@kobato/server/infra/sea/sea')
const seaVfsRootMock = vi.mocked(seaVfsRoot)

afterEach(() => {
  seaVfsRootMock.mockReset()
  seaVfsRootMock.mockReturnValue(null)
})

describe('clientAssetsRoot', () => {
  it('resolves build/client beside the backend bundle outside the SEA binary', () => {
    expect(clientAssetsRoot()).toBe(fileURLToPath(new URL('../../../src/client', import.meta.url)))
    expect(seaVfsRootMock).toHaveBeenCalledTimes(1)
  })

  it('resolves the embedded client/ VFS prefix under the SEA binary', () => {
    seaVfsRootMock.mockReturnValue('/vfs/kobato')

    expect(clientAssetsRoot()).toBe('/vfs/kobato/client')
  })
})
