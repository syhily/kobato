import { describe, expect, it } from 'vitest'

import {
  addMusicSchema,
  deleteMusicSchema,
  listMusicSchema,
  metingSourceSchema,
  publicMusicGetSchema,
  searchMusicSchema,
  updateMusicSchema,
} from '@/server/domains/music/schema'

describe('server/domains/music/schema — metingSourceSchema', () => {
  it('accepts the two known sources', () => {
    expect(metingSourceSchema.safeParse('netease').success).toBe(true)
    expect(metingSourceSchema.safeParse('tencent').success).toBe(true)
  })

  it('rejects an unknown source', () => {
    expect(metingSourceSchema.safeParse('kuwo').success).toBe(false)
  })
})

describe('server/domains/music/schema — listMusicSchema', () => {
  it('accepts an empty payload', () => {
    expect(listMusicSchema.safeParse({}).success).toBe(true)
  })

  it('coerces offset/limit from strings', () => {
    const result = listMusicSchema.safeParse({ offset: '5', limit: '20' })
    expect(result.success).toBe(true)
    expect(result.data?.offset).toBe(5)
    expect(result.data?.limit).toBe(20)
  })

  it('rejects an unknown sortBy', () => {
    expect(listMusicSchema.safeParse({ sortBy: 'random' }).success).toBe(false)
  })

  it('rejects an unknown sortOrder', () => {
    expect(listMusicSchema.safeParse({ sortOrder: 'sideways' }).success).toBe(false)
  })

  it('rejects limit above 100', () => {
    expect(listMusicSchema.safeParse({ limit: 101 }).success).toBe(false)
  })
})

describe('server/domains/music/schema — searchMusicSchema', () => {
  it('accepts a keyword with optional source', () => {
    expect(searchMusicSchema.safeParse({ keyword: 'hello' }).success).toBe(true)
    expect(searchMusicSchema.safeParse({ keyword: 'hello', source: 'netease' }).success).toBe(true)
  })

  it('rejects a missing keyword', () => {
    expect(searchMusicSchema.safeParse({}).success).toBe(false)
  })

  it('rejects limit above 30', () => {
    expect(searchMusicSchema.safeParse({ keyword: 'x', limit: 50 }).success).toBe(false)
  })
})

describe('server/domains/music/schema — addMusicSchema', () => {
  it('accepts a source + sourceId', () => {
    expect(addMusicSchema.safeParse({ source: 'netease', sourceId: '123' }).success).toBe(true)
  })

  it('rejects an empty sourceId', () => {
    expect(addMusicSchema.safeParse({ source: 'netease', sourceId: '' }).success).toBe(false)
  })
})

describe('server/domains/music/schema — deleteMusicSchema', () => {
  it('accepts a non-empty id', () => {
    expect(deleteMusicSchema.safeParse({ id: '1' }).success).toBe(true)
  })
})

describe('server/domains/music/schema — updateMusicSchema', () => {
  const valid = { id: '1', name: 'Song', artist: ['Artist'] }

  it('accepts a valid update and defaults album to empty string', () => {
    const result = updateMusicSchema.safeParse(valid)
    expect(result.success).toBe(true)
    expect(result.data?.album).toBe('')
  })

  it('normalises an empty lyric to null', () => {
    const result = updateMusicSchema.safeParse({ ...valid, lyric: '' })
    expect(result.data?.lyric).toBeNull()
  })

  it('rejects an empty artist array', () => {
    expect(updateMusicSchema.safeParse({ ...valid, artist: [] }).success).toBe(false)
  })

  it('rejects more than 20 artists', () => {
    expect(updateMusicSchema.safeParse({ ...valid, artist: Array.from({ length: 21 }, () => 'A') }).success).toBe(false)
  })

  it('rejects a lyric above 50k chars', () => {
    expect(updateMusicSchema.safeParse({ ...valid, lyric: 'x'.repeat(50_001) }).success).toBe(false)
  })
})

describe('server/domains/music/schema — publicMusicGetSchema', () => {
  it('accepts a 16-char lowercase alphanumeric id', () => {
    expect(publicMusicGetSchema.safeParse({ id: 'abcd1234abcd1234' }).success).toBe(true)
  })

  it('rejects an id with uppercase or wrong length', () => {
    expect(publicMusicGetSchema.safeParse({ id: 'ABCD1234' }).success).toBe(false)
    expect(publicMusicGetSchema.safeParse({ id: 'short' }).success).toBe(false)
  })
})
