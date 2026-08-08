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

/**
 * Remove every draft whose key starts with `prefix`. Edit keys embed the
 * rotating token (`<prefix><entityId>:<token>`), so a per-key clear would
 * orphan rotated predecessors (audit P1-15).
 */
export async function removeDraftsByPrefix(prefix: string): Promise<void> {
  try {
    const db = await getDb()
    const keys = await db.getAllKeys(STORE_NAME, IDBKeyRange.bound(prefix, `${prefix}\uffff`))
    // U+FFFF range end pads the prefix so every matching key falls inside the bound.
    if (keys.length === 0) {
      return
    }
    const tx = db.transaction(STORE_NAME, 'readwrite')
    for (const key of keys) {
      void tx.store.delete(key)
    }
    await tx.done
  } catch {
    // Silently ignore.
  }
}
