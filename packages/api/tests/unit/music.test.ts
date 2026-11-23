import { METING_SOURCES, adminMusicAddInput, adminMusicSearchInput } from '@kobato/api/contracts/admin/music'
import { describe, expect, it } from 'vitest'

describe('METING_SOURCES', () => {
  it('pins the meting provider vocabulary', () => {
    expect([...METING_SOURCES]).toEqual(['netease', 'tencent'])
  })
})

describe('adminMusicSearchInput / adminMusicAddInput source enum', () => {
  it('accepts every meting source on both inputs', async () => {
    for (const source of METING_SOURCES) {
      const search = await adminMusicSearchInput.parseAsync({ keyword: 'foo', source })
      expect(search.source).toBe(source)
      const add = await adminMusicAddInput.parseAsync({ source, sourceId: '123' })
      expect(add.source).toBe(source)
    }
  })

  it('rejects an unknown source', async () => {
    await expect(adminMusicSearchInput.parseAsync({ keyword: 'foo', source: 'spotify' })).rejects.toBeTruthy()
    await expect(adminMusicAddInput.parseAsync({ source: 'spotify', sourceId: '123' })).rejects.toBeTruthy()
  })
})
