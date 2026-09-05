import type { ImageLibrarySettings, LibraryImageItem } from '@/'

// e2e seam (plan C8): `?imageLibrary=fixture` installs a deterministic
// stand-in for the host's media library — local static images only, never an
// external URL. `?imageLibrary=fixture-upload` adds the optional in-picker
// upload stub. The default demo host has no library: the menu entry stays
// hidden.
const FIXTURE_ITEMS: LibraryImageItem[] = [
  {
    src: '/inkling-editor-1.png',
    alt: 'Editor screenshot, light theme',
    width: 1200,
    height: 800,
    thumbhash: 'fixture-thumbhash-light',
    storagePath: 'fixtures/inkling-editor-1.png',
    imageId: 'fixture-image-light',
  },
  {
    src: '/inkling-editor-2.png',
    alt: 'Editor screenshot, dark theme',
    width: 1600,
    height: 900,
    thumbhash: 'fixture-thumbhash-dark',
    storagePath: 'fixtures/inkling-editor-2.png',
    imageId: 'fixture-image-dark',
  },
]

const UPLOADED_ITEM: LibraryImageItem = {
  src: '/inkling-editor-2.png',
  alt: 'Uploaded from the picker',
  width: 1600,
  height: 900,
  imageId: 'fixture-image-uploaded',
}

export function getDemoImageLibrary(flag: string | null): ImageLibrarySettings | undefined {
  if (flag !== 'fixture' && flag !== 'fixture-upload') {
    return undefined
  }

  return {
    search: (query) => {
      const term = query.trim().toLowerCase()
      if (!term) {
        return Promise.resolve(FIXTURE_ITEMS)
      }
      return Promise.resolve(FIXTURE_ITEMS.filter((item) => item.alt?.toLowerCase().includes(term)))
    },
    upload: flag === 'fixture-upload' ? () => Promise.resolve(UPLOADED_ITEM) : undefined,
  }
}
