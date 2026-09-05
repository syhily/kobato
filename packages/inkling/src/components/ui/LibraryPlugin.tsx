import type { NodeKey } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import type { ImageNodeDataset } from '@/nodes/ImageNode'

import LibrarySelector from '@/components/ui/LibrarySelector'
import {
  type ImageLibrarySettings,
  type LibraryImageItem,
  useInklingLibrarySettings,
} from '@/context/InklingHostIntegrationContext'
import { useLibraryBrowser } from '@/hooks/useLibraryBrowser'
import { useSelectorPlaceholderLifecycle } from '@/hooks/useSelectorPlaceholderLifecycle'
import { INSERT_FROM_LIBRARY_COMMAND } from '@/plugins/InklingSelectorPlugin'

/**
 * The only field-mapping point of the library flow: library item → insert dataset. The three host-schema keys are
 * included only when present; the stock image declaration silently ignores
 * them (its property set is fixed), and they persist only when the host
 * declares them as properties on its own card declaration.
 */
export function toImageDataset(item: LibraryImageItem): ImageNodeDataset {
  return {
    src: item.src,
    alt: item.alt ?? '',
    width: item.width ?? null,
    height: item.height ?? null,
    ...(item.thumbhash !== undefined && { thumbhash: item.thumbhash }),
    ...(item.storagePath !== undefined && { storagePath: item.storagePath }),
    ...(item.imageId !== undefined && { imageId: item.imageId }),
  }
}

interface LibraryPluginProps {
  nodeKey: NodeKey
}

// The image-library selector overlay, mounted as the placeholder node's
// transient `selector` component (the GifPlugin precedent): the overlay is
// open while the node exists; Escape / click-outside delete the placeholder.
const LibraryPlugin = ({ nodeKey }: LibraryPluginProps) => {
  const { imageLibrary } = useInklingLibrarySettings()

  // the menu entry is gated on the same config key, so an absent library
  // config means there is nothing to browse — render nothing
  if (!imageLibrary) {
    return null
  }

  return <LibraryPluginSelector nodeKey={nodeKey} imageLibrary={imageLibrary} />
}

const LibraryPluginSelector = ({ nodeKey, imageLibrary }: { nodeKey: NodeKey; imageLibrary: ImageLibrarySettings }) => {
  const browser = useLibraryBrowser({ search: imageLibrary.search })
  const [editor] = useLexicalComposerContext()
  const { closeSelector, placeholderExists } = useSelectorPlaceholderLifecycle(nodeKey)

  const onPick = (item: LibraryImageItem) => {
    // a host upload UX resolves asynchronously and can land after the picker
    // was cancelled — a pick without its placeholder no-ops
    if (!placeholderExists()) {
      return
    }
    editor.dispatchCommand(INSERT_FROM_LIBRARY_COMMAND, toImageDataset(item))
  }

  const onUpload = imageLibrary.upload
    ? () => {
        // the host owns the whole upload UX; its resolution is the selection
        // (undefined = cancelled — the picker stays open)
        void imageLibrary.upload?.().then((item) => {
          if (item) {
            onPick(item)
          }
        })
      }
    : undefined

  return <LibrarySelector browser={browser} onClickOutside={closeSelector} onPick={onPick} onUpload={onUpload} />
}

export default LibraryPlugin
