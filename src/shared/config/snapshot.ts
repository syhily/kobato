import type { BlogSettingsBundle } from '@/shared/config/types'

/**
 * ⚠️ Module-level mutable state — safe only because writes happen in server-side
 * lifecycle code and the value is request-agnostic (global blog settings). If settings
 * ever become tenant- or request-specific this MUST move to request-local storage;
 * the slot stays in shared/ for the isomorphic sync getter.
 */
type Storage = Readonly<{
  blogSettingsSnapshot: BlogSettingsBundle | null | undefined
  blogSettingsHydration: Promise<BlogSettingsBundle | null> | undefined
}>

let storage: Storage = Object.freeze({
  blogSettingsSnapshot: undefined,
  blogSettingsHydration: undefined,
})

function setStorage(partial: Partial<Storage>): void {
  storage = Object.freeze({ ...storage, ...partial })
}

export interface BlogSettingsSnapshotSlot {
  read: () => BlogSettingsBundle | null
  write: (value: BlogSettingsBundle | null | undefined) => void
  readHydration: () => Promise<BlogSettingsBundle | null> | undefined
  writeHydration: (value: Promise<BlogSettingsBundle | null> | undefined) => void
}

export const BLOG_SETTINGS_SNAPSHOT_SLOT: BlogSettingsSnapshotSlot = {
  read: () => storage.blogSettingsSnapshot ?? null,
  write: (value) => {
    setStorage({ blogSettingsSnapshot: value })
  },
  readHydration: () => storage.blogSettingsHydration,
  writeHydration: (value) => {
    setStorage({ blogSettingsHydration: value })
  },
}
