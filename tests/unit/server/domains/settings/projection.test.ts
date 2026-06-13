import { describe, expect, it } from 'vitest'

import { projectAssetsForAdminLegacy, projectSearchForAdminLegacy } from '@/server/domains/settings/projection'

describe('server/domains/settings/projection — projectAssetsForAdminLegacy', () => {
  it('delegates to projectAssetsForAdmin with default masks', () => {
    const result = projectAssetsForAdminLegacy({
      asset: { host: 'cdn.example.com', scheme: 'https' },
      storage: { secretAccessKey: 'abcd' },
      upload: {},
    } as never)
    expect(result.asset.host).toBe('cdn.example.com')
    expect(result.upload.maxBytes).toBe(8 * 1024 * 1024)
  })
})

describe('server/domains/settings/projection — projectSearchForAdminLegacy', () => {
  it('delegates to projectSearchForAdmin with defaults for undefined input', () => {
    const result = projectSearchForAdminLegacy(undefined)
    expect(result.search.enabled).toBe(false)
    expect(result.search.mode).toBe('like')
  })

  it('returns the projected search settings', () => {
    const result = projectSearchForAdminLegacy({
      search: { enabled: true, mode: 'vector', apiKey: 'sk-abcdefghijkl' },
    } as never)
    expect(result.search.enabled).toBe(true)
    expect(result.search.mode).toBe('vector')
    expect(result.apiKeyMask).toBe('ijkl')
  })
})
