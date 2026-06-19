import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import { isRecord } from '@/shared/utils/type-guards'

const DB_NAME = 'kobato-drafts'
const DB_VERSION = 1
const STORE_NAME = 'drafts'

export type DraftType = 'post-edit' | 'page-edit' | 'post-create' | 'page-create'

export interface DraftRecord<TBody = unknown, TMeta = unknown> {
  key: string
  type: DraftType
  body: TBody
  meta?: TMeta
  savedAt: number
  version: number
}

interface DraftsDB extends DBSchema {
  drafts: {
    key: string
    value: DraftRecord
    indexes: {
      byType: DraftType
      bySavedAt: number
    }
  }
}

let dbPromise: Promise<IDBPDatabase<DraftsDB>> | null = null

/** @internal Resets the cached DB promise so tests can start with a fresh database. */
export function __resetDbForTests(): void {
  dbPromise = null
}

function inferTypeFromKey(key: string): DraftType | null {
  // v2 Inkling-backed keys (editor-shell POC). These must be checked before
  // the legacy prefixes because `cms-post-draft:new:v2:` also starts with the
  // old create prefix.
  if (key.startsWith('cms-post-draft:new:v2:')) {
    return 'post-create'
  }
  if (key.startsWith('cms-page-draft:new:v2:')) {
    return 'page-create'
  }
  if (key.startsWith('cms-post-draft-v2:')) {
    return 'post-edit'
  }
  if (key.startsWith('cms-page-draft-v2:')) {
    return 'page-edit'
  }
  // Legacy PortableText-backed keys (kept for the existing wrapper hooks).
  if (key.startsWith('cms-post-draft:new:')) {
    return 'post-create'
  }
  if (key.startsWith('cms-page-draft:new:')) {
    return 'page-create'
  }
  if (key.startsWith('cms-post-draft:')) {
    return 'post-edit'
  }
  if (key.startsWith('cms-page-draft:')) {
    return 'page-edit'
  }
  return null
}

async function migrateFromLocalStorage(db: IDBPDatabase<DraftsDB>): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }

  const keysToMigrate: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (key === null) {
      continue
    }
    if (key.startsWith('cms-post-draft:') || key.startsWith('cms-page-draft:')) {
      keysToMigrate.push(key)
    }
  }

  if (keysToMigrate.length === 0) {
    return
  }

  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.store

  for (const key of keysToMigrate) {
    const raw = window.localStorage.getItem(key)
    if (raw === null) {
      continue
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed)) {
        continue
      }
      const record = parsed
      if (record.version !== 1) {
        continue
      }
      if (!Array.isArray(record.body)) {
        continue
      }

      const type = inferTypeFromKey(key)
      if (type === null) {
        continue
      }

      void store.put({
        key,
        type,
        body: record.body,
        meta: record.meta,
        savedAt: typeof record.savedAt === 'number' ? record.savedAt : Date.now(),
        version: 1,
      })

      window.localStorage.removeItem(key)
    } catch {
      // Skip corrupt entries.
    }
  }

  await tx.done
}

function getDb(): Promise<IDBPDatabase<DraftsDB>> {
  if (dbPromise === null) {
    dbPromise = openDB<DraftsDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
          store.createIndex('byType', 'type')
          store.createIndex('bySavedAt', 'savedAt')
        }
      },
    })
      .then(async (db) => {
        await migrateFromLocalStorage(db)
        return db
      })
      .catch((err) => {
        dbPromise = null
        throw err
      })
  }
  return dbPromise
}

export async function getDraft(key: string): Promise<DraftRecord | null> {
  try {
    const db = await getDb()
    const record = await db.get(STORE_NAME, key)
    return record ?? null
  } catch {
    return null
  }
}

export async function setDraft(key: string, record: DraftRecord): Promise<void> {
  try {
    const db = await getDb()
    await db.put(STORE_NAME, record)
  } catch {
    // Silently ignore quota / private-mode errors.
  }
}

export async function removeDraft(key: string): Promise<void> {
  try {
    const db = await getDb()
    await db.delete(STORE_NAME, key)
  } catch {
    // Silently ignore.
  }
}

export async function listDrafts(filter?: { type?: DraftType; before?: number }): Promise<DraftRecord[]> {
  try {
    const db = await getDb()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.store

    let records: DraftRecord[]
    if (filter?.type !== undefined) {
      records = await store.index('byType').getAll(filter.type)
    } else {
      records = await store.getAll()
    }

    await tx.done

    if (filter?.before !== undefined) {
      records = records.filter((r) => r.savedAt < filter.before!)
    }

    return records
  } catch {
    return []
  }
}

export async function removeDraftsByType(type: DraftType): Promise<number> {
  try {
    const db = await getDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const index = tx.store.index('byType')
    let removed = 0
    let cursor = await index.openCursor(type)
    while (cursor) {
      await cursor.delete()
      removed++
      cursor = await cursor.continue()
    }
    await tx.done
    return removed
  } catch {
    return 0
  }
}

export async function removeDraftsBefore(before: number): Promise<number> {
  try {
    const db = await getDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const index = tx.store.index('bySavedAt')
    const range = IDBKeyRange.upperBound(before)
    let removed = 0
    let cursor = await index.openCursor(range)
    while (cursor) {
      await cursor.delete()
      removed++
      cursor = await cursor.continue()
    }
    await tx.done
    return removed
  } catch {
    return 0
  }
}

export async function removeDraftsByPrefix(prefix: string): Promise<number> {
  try {
    const db = await getDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    let removed = 0
    let cursor = await tx.store.openCursor()
    while (cursor) {
      if (cursor.key.startsWith(prefix)) {
        await cursor.delete()
        removed++
      }
      cursor = await cursor.continue()
    }
    await tx.done
    return removed
  } catch {
    return 0
  }
}

export async function countDrafts(): Promise<number> {
  try {
    const db = await getDb()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const count = await tx.store.count()
    await tx.done
    return count
  } catch {
    return 0
  }
}
