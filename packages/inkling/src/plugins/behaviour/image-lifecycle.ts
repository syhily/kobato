import type { LexicalEditor, NodeKey } from 'lexical'

import { $getNodeByKey } from 'lexical'

import type { CardWidth } from '@/nodes/base/utils/card-widths'

import { $isImageNode, type BaseImageNode } from '@/nodes/base/nodes/image/ImageNode'
import { getDefaultImageCardWidth } from '@/nodes/base/utils/image-card-widths'
import { dataSrcToFile } from '@/utils/dataSrcToFile'
import { getImageDimensions } from '@/utils/getImageDimensions'

// Image lifecycle — the image card's mount-time document-migration
// policies, headless so they are jsdom-testable through real editors
// (previously e2e-only, inline in ImageNodeComponent): the Google-Docs
// data:-URL upload migration, the dimension backfill for older
// serialized/external images, and the allowed-widths clamp. The component
// invokes them from one mount effect each and keeps only the ports.

export interface ImageLifecyclePorts {
  /** Runs the card's upload intent for a file (the media-card upload channel's runner). */
  runUpload: (file: File) => unknown
  /** The card's write seam. */
  write: (mutator: (node: BaseImageNode) => void) => void
  onError: (error: unknown) => void
}

/**
 * The data:-URL migration (copy/paste from Google Docs): converts the src to
 * a File and uploads it through the card's channel. Skips non-data: srcs and
 * in-flight uploads; `isCancelled` abandons a stale run after the await (the
 * component's unmount flag). A conversion failure reports through onError.
 * Returns true when a conversion+upload ran.
 */
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

/**
 * The dimension backfill: older serialized state and externally sourced
 * images may carry no dimensions — read them from the src and write them
 * through the seam. Skips when the node already has dimensions, when the
 * card is mid-insert (initial file / dialog trigger), or when there is no
 * src. A broken/unloadable src reports through onError and leaves the
 * dimensions unset (the historical policy). Returns true when the write
 * landed.
 */
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

/**
 * The allowed-widths clamp: a cardWidth outside the host's allowed set (a
 * config change, an older document) rewrites to the default through the
 * seam — the node write is enough, decorate() re-reads cardWidth on the
 * commit. Returns the clamped width when it fired, null when the current
 * width is allowed.
 */
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
