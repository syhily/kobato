import type { ImageNodeDataset } from '@kobato/inkling-internal/nodes/ImageNode'
import type { NodeKey } from 'lexical'

import LibrarySelector from '@kobato/inkling-internal/components/ui/LibrarySelector'
import {
  type ImageLibrarySettings,
  type LibraryImageItem,
  useInklingLibrarySettings,
} from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { useLibraryBrowser } from '@kobato/inkling-internal/hooks/useLibraryBrowser'
import { useSelectorPlaceholderLifecycle } from '@kobato/inkling-internal/hooks/useSelectorPlaceholderLifecycle'
import { INSERT_FROM_LIBRARY_COMMAND } from '@kobato/inkling-internal/plugins/InklingSelectorPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

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

const LibraryPlugin = ({ nodeKey }: LibraryPluginProps) => {
  const { imageLibrary } = useInklingLibrarySettings()

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
