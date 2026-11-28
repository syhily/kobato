import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clientAssetsRoot } from '@/server/client-assets-root'

vi.mock('@kobato/server/infra/sea/sea', () => ({
  seaVfsRoot: vi.fn(() => null),
}))

const { seaVfsRoot } = await import('@kobato/server/infra/sea/sea')
const seaVfsRootMock = vi.mocked(seaVfsRoot)
const workspaceClientBuild = resolve(import.meta.dirname, '..', '..', '..', 'build', 'workspace', 'client')

afterEach(() => {
  seaVfsRootMock.mockReset()
  seaVfsRootMock.mockReturnValue(null)
})

describe('clientAssetsRoot', () => {
  it('resolves the workspace client build beside the backend bundle, outside the SEA binary', () => {
    expect(clientAssetsRoot()).toBe(workspaceClientBuild)
    expect(seaVfsRootMock).toHaveBeenCalledTimes(1)
  })

  it('never consults the working directory', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue('/nonexistent/working/directory')
    try {
      expect(clientAssetsRoot()).toBe(workspaceClientBuild)
    } finally {
      cwd.mockRestore()
    }
  })

  it('resolves the embedded client/ VFS prefix under the SEA binary', () => {
    seaVfsRootMock.mockReturnValue('/vfs/kobato')

    expect(clientAssetsRoot()).toBe('/vfs/kobato/client')
  })
})
