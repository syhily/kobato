import type { BlogSettingsBundle } from '@/shared/config/types'

/**
 * ⚠️ SSR SAFETY WARNING
 *
 * The `storage` object below is module-level mutable state shared across
 * concurrent requests on the same Node.js instance. That is safe only
 * because writes happen in server-side lifecycle code and the stored
 * value is request-agnostic (global blog settings). If settings ever
 * become tenant- or request-specific, this MUST move to request-local
 * storage (e.g. AsyncLocalStorage) so data does not leak between
 * requests. The slot stays in `shared/` because moving it into
 * `src/server/` would break `getBlogSettingsBundleSync()` in isomorphic
 * code.
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
