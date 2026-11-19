import type { CardWidth } from '@kobato/inkling-internal/nodes/base/utils/card-widths'
import type { LexicalEditor, NodeKey } from 'lexical'

import { $isImageNode, type BaseImageNode } from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
import { getDefaultImageCardWidth } from '@kobato/inkling-internal/nodes/base/utils/image-card-widths'
import { dataSrcToFile } from '@kobato/inkling-internal/utils/data-src-to-file'
import { getImageDimensions } from '@kobato/inkling-internal/utils/get-image-dimensions'
import { $getNodeByKey } from 'lexical'

export interface ImageLifecyclePorts {
  runUpload: (file: File) => unknown

  write: (mutator: (node: BaseImageNode) => void) => void
  onError: (error: unknown) => void
}
export async function migrateImageDataUrl(
  { src, isLoading, isCancelled }: { src: string; isLoading?: boolean; isCancelled?: () => boolean },
  { runUpload, onError }: Pick<ImageLifecyclePorts, 'runUpload' | 'onError'>,
): Promise<boolean> {
  if (!src.startsWith('data:') || isLoading) {
    return false
  }

  try {
    const file = await dataSrcToFile(src)
    if (file && !isCancelled?.()) {
      await runUpload(file)
    }
    return true
  } catch (error) {
    onError(error)
    return false
  }
}

export async function backfillImageDimensions(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  { src, initialFile, triggerFileDialog }: { src: string; initialFile?: File; triggerFileDialog?: boolean },
  { write, onError }: Pick<ImageLifecyclePorts, 'write' | 'onError'>,
): Promise<boolean> {
  const hasMissingDimensions = editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey)
    return $isImageNode(node) && (!node.width || !node.height)
  })
  if (!hasMissingDimensions || !src || initialFile || triggerFileDialog) {
    return false
  }

  try {
    const { width, height } = await getImageDimensions(src)
    write((node) => {
      node.width = width
      node.height = height
    })
    return true
  } catch (error) {
    onError(error)
    return false
  }
}

export function clampImageCardWidth(
  current: CardWidth,
  allowed: CardWidth[],
  { write }: Pick<ImageLifecyclePorts, 'write'>,
): CardWidth | null {
  if (allowed.includes(current)) {
    return null
  }

  const fallback = getDefaultImageCardWidth(allowed)
  write((node) => {
    node.cardWidth = fallback
  })
  return fallback
}
