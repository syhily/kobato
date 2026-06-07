import type { BlogSettingsBundle } from '@/shared/config/types'

/**
 * ⚠️ SSR SAFETY WARNING
 *
 * The `storage` object below is module-level mutable state. In an SSR
 * environment this means the same object is shared across concurrent
 * requests on the same Node.js instance.  The current usage pattern
 * relies on the fact that:
 *
 * 1. `write()` / `writeHydration()` are only called from server-side
 *    request lifecycle code (`hydrateBlogSettings`).
 * 2. The stored value is request-agnostic (global blog settings).
 *
 * If blog settings ever become tenant-specific or request-specific,
 * this MUST be migrated to request-local storage (e.g. AsyncLocalStorage
 * or React Server Context) so that data does not leak between requests.
 *
 * Evaluation: moving this into `src/server/` entry files would break
 * `getBlogSettingsBundleSync()` usage in isomorphic `shared/` code.
 * The current compromise is to keep the slot in `shared/` with the
 * explicit warning above.
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
