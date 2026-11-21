import type { BlogSettingsBundle } from '@kobato/settings/types'

type Storage = Readonly<{
  blogSettingsSnapshot: BlogSettingsBundle | null
  blogSettingsRevision: string
  blogSettingsRevisionSeq: number
  blogSettingsHydration: Promise<BlogSettingsBundle | null> | undefined
}>

export interface BlogSettingsSnapshot {
  bundle: BlogSettingsBundle | null
  revision: string
}

function createBootId(): string {
  const crypto = globalThis.crypto
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const BOOT_ID = createBootId()
const REVISION_SEQ_WIDTH = 10

function revisionToken(seq: number): string {
  return `${BOOT_ID}:${String(seq).padStart(REVISION_SEQ_WIDTH, '0')}`
}

let storage: Storage = Object.freeze({
  blogSettingsSnapshot: null,
  blogSettingsRevision: revisionToken(0),
  blogSettingsRevisionSeq: 0,
  blogSettingsHydration: undefined,
})

function setStorage(partial: Partial<Storage>): void {
  storage = Object.freeze({ ...storage, ...partial })
}

export interface BlogSettingsSnapshotSlot {
  read: () => BlogSettingsBundle | null
  readSnapshot: () => BlogSettingsSnapshot
  write: (value: BlogSettingsBundle | null | undefined) => void
  readHydration: () => Promise<BlogSettingsBundle | null> | undefined
  writeHydration: (value: Promise<BlogSettingsBundle | null> | undefined) => void
}

export const BLOG_SETTINGS_SNAPSHOT_SLOT: BlogSettingsSnapshotSlot = {
  read: () => storage.blogSettingsSnapshot,
  readSnapshot: () => ({ bundle: storage.blogSettingsSnapshot, revision: storage.blogSettingsRevision }),
  write: (value) => {
    const seq = storage.blogSettingsRevisionSeq + 1
    setStorage({
      blogSettingsSnapshot: value ?? null,
      blogSettingsRevision: revisionToken(seq),
      blogSettingsRevisionSeq: seq,
    })
  },
  readHydration: () => storage.blogSettingsHydration,
  writeHydration: (value) => {
    setStorage({ blogSettingsHydration: value })
  },
}
