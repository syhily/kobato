import type { GalleryImage } from '@kobato/inkling-internal/types/gallery'

import {
  createGalleryImagesMirror,
  type GalleryImagesMirror,
} from '@kobato/inkling-internal/hooks/gallery-images-mirror'
import { useCardWriter } from '@kobato/inkling-internal/hooks/useCardWriter'
import { $isGalleryNode } from '@kobato/inkling-internal/nodes/base'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type NodeKey } from 'lexical'
import React from 'react'

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

  const images = React.useSyncExternalStore(mirror.subscribe, mirror.getSnapshot)

  return { images, setImages: mirror.setImages, setPreviewImages: mirror.setPreviewImages }
}
