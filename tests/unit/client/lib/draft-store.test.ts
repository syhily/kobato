import { openDB } from 'idb'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  __resetDbForTests,
  countDrafts,
  getDraft,
  listDrafts,
  removeDraft,
  removeDraftsBefore,
  removeDraftsByPrefix,
  removeDraftsByType,
  setDraft,
} from '@/client/lib/draft-store'

const localStorageData = new Map<string, string>()

Object.defineProperty(globalThis, 'window', {
  value: {
    localStorage: {
      getItem: (key: string) => localStorageData.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageData.set(key, value),
      removeItem: (key: string) => localStorageData.delete(key),
      clear: () => localStorageData.clear(),
      get length() {
        return localStorageData.size
      },
      key: (index: number) => Array.from(localStorageData.keys())[index] ?? null,
    },
  },
  writable: true,
  configurable: true,
})

beforeEach(async () => {
  localStorageData.clear()

  // fake-indexeddb's deleteDatabase does not resolve reliably,
  // so we open the DB and clear the store instead.
  try {
    const db = await openDB('kobato-drafts', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('drafts')) {
          const store = db.createObjectStore('drafts', { keyPath: 'key' })
          store.createIndex('byType', 'type')
          store.createIndex('bySavedAt', 'savedAt')
        }
      },
    })
    const tx = db.transaction('drafts', 'readwrite')
    await tx.store.clear()
    await tx.done
    db.close()
  } catch {
    // Ignore — DB may not exist yet.
  }

  __resetDbForTests()
})

describe('draft-store', () => {
  it('round-trips a draft through setDraft and getDraft', async () => {
    const record = {
      key: 'cms-post-draft:abc:token1',
      type: 'post-edit' as const,
      body: [{ type: 'paragraph', children: [{ text: 'hello' }] }],
      savedAt: 1_700_000_000_000,
      version: 1,
    }
    await setDraft(record.key, record)
    const result = await getDraft(record.key)
    expect(result).toEqual(record)
  })

  it('returns null for missing draft', async () => {
    const result = await getDraft('cms-post-draft:missing:token')
    expect(result).toBeNull()
  })

  it('removes a draft', async () => {
    const key = 'cms-page-draft:page1:token1'
    await setDraft(key, {
      key,
      type: 'page-edit',
      body: [],
      savedAt: 1,
      version: 1,
    })
    await removeDraft(key)
    const result = await getDraft(key)
    expect(result).toBeNull()
  })

  it('lists all drafts', async () => {
    const r1 = {
      key: 'cms-post-draft:p1:t1',
      type: 'post-edit' as const,
      body: [],
      savedAt: 100,
      version: 1,
    }
    const r2 = {
      key: 'cms-page-draft:p2:t2',
      type: 'page-edit' as const,
      body: [],
      savedAt: 200,
      version: 1,
    }
    await setDraft(r1.key, r1)
    await setDraft(r2.key, r2)
    const all = await listDrafts()
    expect(all).toHaveLength(2)
    expect(all.map((r) => r.key)).toContain(r1.key)
    expect(all.map((r) => r.key)).toContain(r2.key)
  })

  it('filters drafts by type', async () => {
    await setDraft('k1', {
      key: 'k1',
      type: 'post-create',
      body: [],
      savedAt: 1,
      version: 1,
    })
    await setDraft('k2', {
      key: 'k2',
      type: 'page-edit',
      body: [],
      savedAt: 2,
      version: 1,
    })
    const posts = await listDrafts({ type: 'post-create' })
    expect(posts).toHaveLength(1)
    expect(posts[0]!.key).toBe('k1')
  })

  it('filters drafts by savedAt ceiling', async () => {
    await setDraft('k1', {
      key: 'k1',
      type: 'post-edit',
      body: [],
      savedAt: 100,
      version: 1,
    })
    await setDraft('k2', {
      key: 'k2',
      type: 'post-edit',
      body: [],
      savedAt: 200,
      version: 1,
    })
    const old = await listDrafts({ before: 150 })
    expect(old).toHaveLength(1)
    expect(old[0]!.key).toBe('k1')
  })

  it('counts drafts', async () => {
    expect(await countDrafts()).toBe(0)
    await setDraft('k1', { key: 'k1', type: 'post-edit', body: [], savedAt: 1, version: 1 })
    expect(await countDrafts()).toBe(1)
  })

  it('removes drafts by type', async () => {
    await setDraft('k1', { key: 'k1', type: 'post-edit', body: [], savedAt: 1, version: 1 })
    await setDraft('k2', { key: 'k2', type: 'post-create', body: [], savedAt: 2, version: 1 })
    await setDraft('k3', { key: 'k3', type: 'page-edit', body: [], savedAt: 3, version: 1 })
    const removed = await removeDraftsByType('post-edit')
    expect(removed).toBe(1)
    expect(await countDrafts()).toBe(2)
  })

  it('removes drafts before a timestamp', async () => {
    await setDraft('k1', { key: 'k1', type: 'post-edit', body: [], savedAt: 100, version: 1 })
    await setDraft('k2', { key: 'k2', type: 'post-edit', body: [], savedAt: 200, version: 1 })
    const removed = await removeDraftsBefore(150)
    expect(removed).toBe(1)
    expect(await countDrafts()).toBe(1)
  })

  it('migrates legacy localStorage drafts on first DB open', async () => {
    localStorageData.set(
      'cms-post-draft:legacy-post:token',
      JSON.stringify({
        version: 1,
        postId: 'legacy-post',
        clientRevisionToken: 'token',
        body: [{ type: 'paragraph', children: [{ text: 'migrated' }] }],
        savedAt: 1_700_000_000_000,
      }),
    )
    localStorageData.set(
      'cms-page-draft:new:session-abc',
      JSON.stringify({
        version: 1,
        sessionId: 'session-abc',
        body: [{ type: 'paragraph', children: [{ text: 'page create' }] }],
        meta: { title: 'T' },
        savedAt: 1_700_000_000_001,
      }),
    )
    localStorageData.set('other-key', 'should-stay')

    // DB open triggers migration automatically on first access.
    expect(await countDrafts()).toBe(2)

    const post = await getDraft('cms-post-draft:legacy-post:token')
    expect(post).not.toBeNull()
    expect(post!.type).toBe('post-edit')
    expect(post!.body).toEqual([{ type: 'paragraph', children: [{ text: 'migrated' }] }])

    const page = await getDraft('cms-page-draft:new:session-abc')
    expect(page).not.toBeNull()
    expect(page!.type).toBe('page-create')
    expect(page!.meta).toEqual({ title: 'T' })

    // Legacy keys removed, unrelated key preserved.
    expect(localStorageData.has('cms-post-draft:legacy-post:token')).toBe(false)
    expect(localStorageData.has('cms-page-draft:new:session-abc')).toBe(false)
    expect(localStorageData.get('other-key')).toBe('should-stay')
  })

  it('skips corrupt localStorage entries during migration', async () => {
    localStorageData.set('cms-post-draft:bad', 'not-json')
    localStorageData.set('cms-post-draft:wrong-version', JSON.stringify({ version: 2, body: [] }))
    localStorageData.set('cms-post-draft:missing-body', JSON.stringify({ version: 1 }))

    expect(await countDrafts()).toBe(0)
  })

  it('removes drafts by prefix', async () => {
    await setDraft('cms-post-draft:p1:t1', {
      key: 'cms-post-draft:p1:t1',
      type: 'post-edit',
      body: [],
      savedAt: 1,
      version: 1,
    })
    await setDraft('cms-post-draft:p2:t2', {
      key: 'cms-post-draft:p2:t2',
      type: 'post-edit',
      body: [],
      savedAt: 2,
      version: 1,
    })
    await setDraft('cms-page-draft:page1:t1', {
      key: 'cms-page-draft:page1:t1',
      type: 'page-edit',
      body: [],
      savedAt: 3,
      version: 1,
    })

    const removed = await removeDraftsByPrefix('cms-post-draft:')
    expect(removed).toBe(2)
    expect(await countDrafts()).toBe(1)
    expect(await getDraft('cms-page-draft:page1:t1')).not.toBeNull()
  })

  it('returns 0 when removing drafts by a non-matching prefix', async () => {
    await setDraft('k1', { key: 'k1', type: 'post-edit', body: [], savedAt: 1, version: 1 })
    const removed = await removeDraftsByPrefix('no-match')
    expect(removed).toBe(0)
    expect(await countDrafts()).toBe(1)
  })

  it('overwrites an existing draft with the same key', async () => {
    const key = 'cms-post-draft:p1:t1'
    await setDraft(key, { key, type: 'post-edit', body: [{ text: 'first' }], savedAt: 100, version: 1 })
    await setDraft(key, { key, type: 'post-edit', body: [{ text: 'second' }], savedAt: 200, version: 1 })
    const result = await getDraft(key)
    expect(result).not.toBeNull()
    expect(result!.body).toEqual([{ text: 'second' }])
    expect(result!.savedAt).toBe(200)
  })

  it('returns empty array when listing drafts in an empty store', async () => {
    const all = await listDrafts()
    expect(all).toEqual([])
  })

  it('returns 0 when counting drafts in an empty store', async () => {
    expect(await countDrafts()).toBe(0)
  })
})
