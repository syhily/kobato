import type { BlogSettingsBundle } from '@/shared/config/types'

const globalForSnapshot = globalThis as typeof globalThis & {
  blogSettingsSnapshot: BlogSettingsBundle | null | undefined
  blogSettingsHydration: Promise<BlogSettingsBundle | null> | undefined
}

export interface BlogSettingsSnapshotSlot {
  read: () => BlogSettingsBundle | null
  write: (value: BlogSettingsBundle | null | undefined) => void
  readHydration: () => Promise<BlogSettingsBundle | null> | undefined
  writeHydration: (value: Promise<BlogSettingsBundle | null> | undefined) => void
}

export const BLOG_SETTINGS_SNAPSHOT_SLOT: BlogSettingsSnapshotSlot = {
  read: () => globalForSnapshot.blogSettingsSnapshot ?? null,
  write: (value) => {
    globalForSnapshot.blogSettingsSnapshot = value
  },
  readHydration: () => globalForSnapshot.blogSettingsHydration,
  writeHydration: (value) => {
    globalForSnapshot.blogSettingsHydration = value
  },
}
