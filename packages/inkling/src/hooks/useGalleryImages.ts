import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type NodeKey } from 'lexical'
import React from 'react'

import type { GalleryImage } from '@/types/gallery'

import { createGalleryImagesMirror, type GalleryImagesMirror } from '@/hooks/gallery-images-mirror'
import { useCardWriter } from '@/hooks/useCardWriter'
import { $isGalleryNode } from '@/nodes/base'

/**
 * The React adapter of the gallery images mirror (see gallery-images-mirror.ts):
 * nodeKey in, the rendered image list plus the two-phase setters out. The node
 * subscription starts on mount and the snapshot resyncs whenever the node's
 * images change externally (within-card undo, collab) while the card stays
 * mounted. Node writes go through the card write seam (useCardWriter).
 */
export interface GalleryImagesBinding {
  images: GalleryImage[]
  setImages: GalleryImagesMirror['setImages']
  setPreviewImages: GalleryImagesMirror['setPreviewImages']
}

export function useGalleryImages(nodeKey: NodeKey): GalleryImagesBinding {
  const [editor] = useLexicalComposerContext()
  const write = useCardWriter(nodeKey, $isGalleryNode)

  const [mirror] = React.useState(() =>
    createGalleryImagesMirror({
      readNodeImages: () =>
        editor.getEditorState().read(() => {
          const node = $getNodeByKey(nodeKey)
          return $isGalleryNode(node) ? node.images : undefined
        }),
      writeNodeImages: (images) => {
        write((node) => node.setImages(images))
      },
      subscribeToNodeImages: (listener) =>
        editor.registerUpdateListener(({ dirtyLeaves, dirtyElements }) => {
          if (dirtyLeaves.has(nodeKey) || dirtyElements.has(nodeKey)) {
            listener()
          }
        }),
    }),
  )

  React.useEffect(() => {
    mirror.start()
    return () => {
      mirror.dispose()
    }
  }, [mirror])

  // the mirror's methods are closure-bound, so they ride
  // useSyncExternalStore and the binding straight through
  const images = React.useSyncExternalStore(mirror.subscribe, mirror.getSnapshot)

  return { images, setImages: mirror.setImages, setPreviewImages: mirror.setPreviewImages }
}
