import type { GalleryImage } from '@/types/gallery'

import { ALLOWED_IMAGE_PROPS } from '@/nodes/base'
import { createSnapshotStore } from '@/utils/services/snapshot-store'

// Gallery images mirror — the headless module owning BOTH directions of the
// gallery card's image list:
//
//   node → view: the node is the persistent truth. Every external change
//     (within-card undo, collab) resyncs the snapshot wholesale, so a mounted
//     card never renders a stale list — and the next interaction can't write
//     one back through the card write seam.
//   view → node: local mutations (reorder, delete, upload results) publish to
//     the snapshot FIRST and write the node through the injected seam port.
//     In-flight upload previews publish as a local-only overlay, preserving
//     the upload-intent adapter's preview-first ordering (the preview shows
//     before the upload resolves; the node is written only after).
//
// The node persists only ALLOWED_IMAGE_PROPS (its setImages picks them), so
// the write's echo arrives with a fresh array reference carrying stripped
// clones: echo detection compares persisted props only, and an echo adopts
// the node's copy as the new baseline while KEEPING the overlay — a reorder
// during an in-flight upload must not drop the previews' blob srcs. Anything
// that is not an echo is external and replaces the overlay wholesale.
//
// The editor plumbing lives behind injected ports so the resync/echo policy
// is a synchronous test table; useGalleryImages is the React adapter.

export interface GalleryImagesMirrorPorts {
  /** Reads the node's current images; undefined when the node is gone. */
  readNodeImages: () => GalleryImage[] | undefined
  /** Writes images to the node through the card write seam. */
  writeNodeImages: (images: GalleryImage[]) => void
  /** Fires when the node's images may have changed; returns an unsubscribe. */
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
  // the store holds the two state pieces; the published snapshot derives
  // from them (overlay ?? nodeImages), so an emit that leaves the rendered
  // list unchanged notifies listeners but cannot re-render React
  const store = createSnapshotStore<{ nodeImages: GalleryImage[]; overlay: GalleryImage[] | null }>({
    nodeImages: readNodeImages() ?? [],
    overlay: null,
  })
  let unsubscribeFromNode: (() => void) | null = null

  const resyncFromNode = () => {
    const { nodeImages, overlay } = store.getSnapshot()
    const fresh = readNodeImages() ?? []
    if (fresh === nodeImages) {
      // the node was touched without replacing its images (e.g. caption dirt)
      return
    }
    if (overlay !== null && samePersistedImages(fresh, overlay)) {
      // the echo of our own write: adopt the node's copy as the baseline but
      // keep the overlay — it still carries the in-flight preview props the
      // node deliberately strips, and the rendered list is unchanged
      store.emit({ nodeImages: fresh })
      return
    }
    // an external change: the node wins wholesale
    store.emit({ nodeImages: fresh, overlay: null })
  }

  return {
    /** The rendered list: the local overlay while one is set, else the node images. */
    getSnapshot: () => {
      const { nodeImages, overlay } = store.getSnapshot()
      return overlay ?? nodeImages
    },

    subscribe: store.subscribe,

    /** Local mutation: renders immediately, then writes the node through the seam port. */
    setImages: (images: GalleryImage[]) => {
      store.emit({ overlay: images })
      writeNodeImages(images)
    },

    /** Preview overlay: renders immediately, never written to the node. */
    setPreviewImages: (images: GalleryImage[]) => {
      store.emit({ overlay: images })
    },

    /** Begin the node subscription (adapter mount). */
    start: () => {
      unsubscribeFromNode ??= subscribeToNodeImages(resyncFromNode)
    },

    /** End the node subscription (adapter unmount). */
    dispose: () => {
      unsubscribeFromNode?.()
      unsubscribeFromNode = null
    },
  }
}

export type GalleryImagesMirror = ReturnType<typeof createGalleryImagesMirror>
