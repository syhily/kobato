import type { GalleryImage } from '@kobato/inkling-internal/types/gallery'

import { ALLOWED_IMAGE_PROPS } from '@kobato/inkling-internal/nodes/base'
import { createSnapshotStore } from '@kobato/inkling-internal/services/snapshot-store'

export interface GalleryImagesMirrorPorts {
  readNodeImages: () => GalleryImage[] | undefined
  writeNodeImages: (images: GalleryImage[]) => void
  subscribeToNodeImages: (listener: () => void) => () => void
}
function samePersistedImages(a: GalleryImage[], b: GalleryImage[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every((image, index) => ALLOWED_IMAGE_PROPS.every((prop) => image[prop] === b[index][prop]))
}
export function createGalleryImagesMirror({
  readNodeImages,
  writeNodeImages,
  subscribeToNodeImages,
}: GalleryImagesMirrorPorts) {
  const store = createSnapshotStore<{ nodeImages: GalleryImage[]; overlay: GalleryImage[] | null }>({
    nodeImages: readNodeImages() ?? [],
    overlay: null,
  })
  let unsubscribeFromNode: (() => void) | null = null

  const resyncFromNode = () => {
    const { nodeImages, overlay } = store.getSnapshot()
    const fresh = readNodeImages() ?? []
    if (fresh === nodeImages) {
      return
    }
    if (overlay !== null && samePersistedImages(fresh, overlay)) {
      store.emit({ nodeImages: fresh })
      return
    }
    store.emit({ nodeImages: fresh, overlay: null })
  }

  return {
    getSnapshot: () => {
      const { nodeImages, overlay } = store.getSnapshot()
      return overlay ?? nodeImages
    },

    subscribe: store.subscribe,

    setImages: (images: GalleryImage[]) => {
      store.emit({ overlay: images })
      writeNodeImages(images)
    },

    setPreviewImages: (images: GalleryImage[]) => {
      store.emit({ overlay: images })
    },

    start: () => {
      unsubscribeFromNode ??= subscribeToNodeImages(resyncFromNode)
    },

    dispose: () => {
      unsubscribeFromNode?.()
      unsubscribeFromNode = null
    },
  }
}

export type GalleryImagesMirror = ReturnType<typeof createGalleryImagesMirror>
