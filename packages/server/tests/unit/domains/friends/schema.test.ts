import {
  applyFriendSchema,
  friendIdSchema,
  listFriendsSchema,
  upsertFriendSchema,
} from '@kobato/server/domains/friends/schema'
import { describe, expect, it } from 'vitest'

describe('server/domains/friends/schema — listFriendsSchema', () => {
  it('accepts an empty payload and defaults includeHidden to false', () => {
    const result = listFriendsSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.includeHidden).toBe(false)
    }
  })

  it('coerces string "true" / "false" into booleans for includeHidden', () => {
    const t = listFriendsSchema.safeParse({ includeHidden: 'true' })
    const f = listFriendsSchema.safeParse({ includeHidden: 'false' })
    expect(t.data?.includeHidden).toBe(true)
    expect(f.data?.includeHidden).toBe(false)
  })

  it('coerces offset and limit from strings', () => {
    const result = listFriendsSchema.safeParse({ offset: '5', limit: '20' })
    expect(result.success).toBe(true)
    expect(result.data?.offset).toBe(5)
    expect(result.data?.limit).toBe(20)
  })

  it('passes an exact visibility match through (pending-review bucket)', () => {
    const result = listFriendsSchema.safeParse({ visible: false })
    expect(result.success).toBe(true)
    expect(result.data?.visible).toBe(false)
  })

  it('rejects limit above 100', () => {
    expect(listFriendsSchema.safeParse({ limit: 101 }).success).toBe(false)
  })

  it('rejects offset below 0', () => {
    expect(listFriendsSchema.safeParse({ offset: -1 }).success).toBe(false)
  })
})

describe('server/domains/friends/schema — friendIdSchema', () => {
  it('accepts a non-empty id', () => {
    expect(friendIdSchema.safeParse({ id: '42' }).success).toBe(true)
  })

  it('rejects an empty id', () => {
    expect(friendIdSchema.safeParse({ id: '' }).success).toBe(false)
  })
})

describe('server/domains/friends/schema — upsertFriendSchema', () => {
  const valid = {
    website: 'Site',
    homepage: 'https://a.com',
    poster: 'https://a.com/p.png',
  }

  it('accepts a minimal create payload and defaults visible to true', () => {
    const result = upsertFriendSchema.safeParse(valid)
    expect(result.success).toBe(true)
    expect(result.data?.visible).toBe(true)
  })

  it('treats empty description as undefined', () => {
    const result = upsertFriendSchema.safeParse({ ...valid, description: '' })
    expect(result.success).toBe(true)
    expect(result.data?.description).toBeUndefined()
  })

  it('accepts a null description and normalizes it to undefined', () => {
    const result = upsertFriendSchema.safeParse({ ...valid, description: null })
    expect(result.success).toBe(true)
    expect(result.data?.description).toBeUndefined()
  })

  it('treats empty rssUrl as undefined', () => {
    const result = upsertFriendSchema.safeParse({ ...valid, rssUrl: '' })
    expect(result.success).toBe(true)
    expect(result.data?.rssUrl).toBeUndefined()
  })

  it('accepts a null rssUrl and normalizes it to undefined', () => {
    const result = upsertFriendSchema.safeParse({ ...valid, rssUrl: null })
    expect(result.success).toBe(true)
    expect(result.data?.rssUrl).toBeUndefined()
  })

  it('accepts an id for update', () => {
    const result = upsertFriendSchema.safeParse({ ...valid, id: '5' })
    expect(result.success).toBe(true)
    expect(result.data?.id).toBe('5')
  })

  it('rejects website longer than 80 chars', () => {
    expect(upsertFriendSchema.safeParse({ ...valid, website: 'x'.repeat(81) }).success).toBe(false)
  })

  it('rejects an invalid homepage URL', () => {
    expect(upsertFriendSchema.safeParse({ ...valid, homepage: 'not-a-url' }).success).toBe(false)
  })
})

describe('server/domains/friends/schema — applyFriendSchema', () => {
  const valid = {
    website: 'Site',
    homepage: 'https://a.com',
  }

  it('accepts a minimal payload (poster and rssUrl optional)', () => {
    const result = applyFriendSchema.safeParse(valid)
    expect(result.success).toBe(true)
    expect(result.data?.poster).toBeUndefined()
    expect(result.data?.rssUrl).toBeUndefined()
    expect(result.data?.contact).toBe('')
  })

  it('treats blank optional URLs as undefined', () => {
    const result = applyFriendSchema.safeParse({ ...valid, poster: '', rssUrl: '' })
    expect(result.success).toBe(true)
    expect(result.data?.poster).toBeUndefined()
    expect(result.data?.rssUrl).toBeUndefined()
  })

  it('rejects a filled honeypot with the generic invalid-input message', () => {
    const result = applyFriendSchema.safeParse({ ...valid, contact: 'spammy' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('contact'))
      expect(issue?.message).toBe('输入数据无效。')
    }
  })

  it('rejects non-http(s) homepage URLs', () => {
    expect(applyFriendSchema.safeParse({ ...valid, homepage: 'javascript:alert(1)' }).success).toBe(false)
    expect(applyFriendSchema.safeParse({ ...valid, homepage: 'ftp://a.com' }).success).toBe(false)
  })

  it('rejects non-http(s) poster and rssUrl when present', () => {
    expect(applyFriendSchema.safeParse({ ...valid, poster: 'javascript:alert(1)' }).success).toBe(false)
    expect(applyFriendSchema.safeParse({ ...valid, rssUrl: 'ftp://a.com/rss' }).success).toBe(false)
  })

  it('rejects website longer than 80 chars', () => {
    expect(applyFriendSchema.safeParse({ ...valid, website: 'x'.repeat(81) }).success).toBe(false)
  })
})
