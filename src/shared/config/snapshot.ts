import type { BlogSettingsBundle } from '@/shared/config/types'

const storage: {
  blogSettingsSnapshot: BlogSettingsBundle | null | undefined
  blogSettingsHydration: Promise<BlogSettingsBundle | null> | undefined
} = {
  blogSettingsSnapshot: undefined,
  blogSettingsHydration: undefined,
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
    storage.blogSettingsSnapshot = value
  },
  readHydration: () => storage.blogSettingsHydration,
  writeHydration: (value) => {
    storage.blogSettingsHydration = value
  },
}
