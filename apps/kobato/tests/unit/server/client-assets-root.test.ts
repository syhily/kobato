import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clientAssetsRoot } from '@/server/client-assets-root'

vi.mock('@kobato/server/infra/sea/sea', () => ({
  seaVfsRoot: vi.fn(() => null),
}))

const { seaVfsRoot } = await import('@kobato/server/infra/sea/sea')
const seaVfsRootMock = vi.mocked(seaVfsRoot)
const adminPackageDir = dirname(createRequire(import.meta.url).resolve('@kobato/web-admin/package.json'))

afterEach(() => {
  seaVfsRootMock.mockReset()
  seaVfsRootMock.mockReturnValue(null)
})

describe('clientAssetsRoot', () => {
  it('resolves the workspace client build through the @kobato/web-admin package outside the SEA binary', () => {
    expect(clientAssetsRoot()).toBe(join(adminPackageDir, 'build', 'client'))
    expect(seaVfsRootMock).toHaveBeenCalledTimes(1)
  })

  it('never consults the working directory', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue('/nonexistent/working/directory')
    try {
      expect(clientAssetsRoot()).toBe(join(adminPackageDir, 'build', 'client'))
    } finally {
      cwd.mockRestore()
    }
  })

  it('resolves the embedded client/ VFS prefix under the SEA binary', () => {
    seaVfsRootMock.mockReturnValue('/vfs/kobato')

    expect(clientAssetsRoot()).toBe('/vfs/kobato/client')
  })
})
