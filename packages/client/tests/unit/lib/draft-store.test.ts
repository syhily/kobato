import {
  __resetDbForTests,
  getDraft,
  removeDraft,
  removeDraftsByPrefix,
  setDraft,
} from '@kobato/client/lib/draft-store'
import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'

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

    // DB open triggers migration automatically on first access; unrelated
    // localStorage keys are never migrated into IDB.
    expect(await getDraft('other-key')).toBeNull()

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

    expect(await getDraft('cms-post-draft:bad')).toBeNull()
    expect(await getDraft('cms-post-draft:wrong-version')).toBeNull()
    expect(await getDraft('cms-post-draft:missing-body')).toBeNull()
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

  it('removeDraftsByPrefix removes every rotated-token draft for the entity and keeps other entities', async () => {
    // Audit P1-15: the draft key embeds the clientRevisionToken, so every
    // token rotation leaves an orphan full-body draft behind. Clearing must
    // sweep ALL of the entity's keys, not just the current-token one.
    const seed = (key: string, type: 'post-edit' | 'page-edit') =>
      setDraft(key, { key, type, body: [{ text: key }], savedAt: 1, version: 1 })
    await seed('cms-post-draft:1:tok-a', 'post-edit')
    await seed('cms-post-draft:1:tok-b', 'post-edit')
    await seed('cms-post-draft:1:tok-c', 'post-edit')
    await seed('cms-post-draft:2:tok-a', 'post-edit')
    await seed('cms-page-draft:1:tok-a', 'page-edit')

    await removeDraftsByPrefix('cms-post-draft:1:')

    expect(await getDraft('cms-post-draft:1:tok-a')).toBeNull()
    expect(await getDraft('cms-post-draft:1:tok-b')).toBeNull()
    expect(await getDraft('cms-post-draft:1:tok-c')).toBeNull()
    // Other entities and other content types are untouched.
    expect(await getDraft('cms-post-draft:2:tok-a')).not.toBeNull()
    expect(await getDraft('cms-page-draft:1:tok-a')).not.toBeNull()
  })
})
