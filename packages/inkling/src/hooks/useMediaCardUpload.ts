import type { FileUploader } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import type { UseFileDragAndDropResult } from '@kobato/inkling-internal/hooks/useFileDragAndDrop'
import type { TriggerFileDialogCardNode } from '@kobato/inkling-internal/hooks/useTriggerFileDialog'
import type { UploadFn } from '@kobato/inkling-internal/nodes/upload-intent'
import type { NodeKey } from 'lexical'

import { useInklingHostEssentials } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import useFileDragAndDrop from '@kobato/inkling-internal/hooks/useFileDragAndDrop'
import { useInitialFileUpload } from '@kobato/inkling-internal/hooks/useInitialFileUpload'
import { useTriggerFileDialog } from '@kobato/inkling-internal/hooks/useTriggerFileDialog'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

export type MediaUploadKind = 'image' | 'video' | 'audio' | 'file' | 'mediaThumbnail'
export type MediaUploader = ReturnType<FileUploader['useFileUpload']>
/**
 * The bare host-uploader channel for one media kind — the one home of the
 * host-hook identity contract (the composer requires `useFileUpload` to be
 * identity-stable for the editor's lifetime, so this call returns the same
 * function every render; the compiler cannot verify context provenance).
 * Channels without input/drag/dialog wiring (video's main→thumbnail
 * composition uploads its synthesized thumbnail through this) use it
 * directly instead of re-typing the contract's lint suppression.
 */
export function useMediaUploader(kind: MediaUploadKind): MediaUploader {
  const { fileUploader } = useInklingHostEssentials()
  // oxlint-disable-next-line react/hooks -- host-provided hook; identity is a composer contract
  return fileUploader.useFileUpload(kind)
}

export type MediaUploadSource = 'input' | 'drop' | 'initial'

export interface UseMediaCardUploadOptions<TNode> {
  kind: MediaUploadKind
  nodeKey: NodeKey

  guard: (node: unknown) => node is TNode
  onFiles: (files: FileList | File[] | null, upload: UploadFn, source: MediaUploadSource) => unknown

  initialFile?: File | null

  isReady?: (uploader: MediaUploader) => boolean
  triggerFileDialog?: boolean
  dragDisabled?: boolean
}

export interface UseMediaCardUploadResult {
  uploader: MediaUploader
  fileInputRef: React.RefObject<HTMLInputElement | null>
  dragHandler: UseFileDragAndDropResult
  onFileChange: (files: FileList | File[] | null) => void

  runFiles: (files: FileList | File[] | null, source: MediaUploadSource) => void
  mimeTypes: string[] | undefined
}

export function useMediaCardUpload<TNode>({
  kind,
  nodeKey,
  guard,
  onFiles,
  initialFile,
  isReady,
  triggerFileDialog,
  dragDisabled = false,
}: UseMediaCardUploadOptions<TNode>): UseMediaCardUploadResult {
  const [editor] = useLexicalComposerContext()
  const { fileUploader } = useInklingHostEssentials()
  const uploader = useMediaUploader(kind)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const runFiles = React.useCallback(
    (files: FileList | File[] | null, source: MediaUploadSource) => {
      onFiles(files, uploader.upload, source)
    },
    [onFiles, uploader.upload],
  )

  const dragHandler = useFileDragAndDrop({
    handleDrop: (files) => runFiles(files, 'drop'),
    disabled: dragDisabled,
  })

  useInitialFileUpload({
    initialFile,
    isReady: isReady?.(uploader) ?? true,
    run: (file) => runFiles([file], 'initial'),
  })

  useTriggerFileDialog({
    editor,
    nodeKey,
    // composed runtime narrowing instead of a cast: `TNode` can't be constrained
    // to `TriggerFileDialogCardNode` — gallery/header guards narrow to node types
    // without `triggerFileDialog`, and the cards' `triggerFileDialog?: boolean |
    // undefined` property isn't assignable to the interface's write-only setter
    // under strict mode. The probe matches the accessor the assembled card classes
    // generate from the spec's `accessor: true` entry.
    guard: (node: unknown): node is TriggerFileDialogCardNode =>
      typeof node === 'object' && node !== null && 'triggerFileDialog' in node && guard(node),
    fileInputRef,
    triggerFileDialog,
  })

  const onFileChange = React.useCallback(
    (files: FileList | File[] | null) => {
      if (!files || files.length === 0) {
        return
      }
      runFiles(files, 'input')
    },
    [runFiles],
  )

  const fileTypesKey = kind === 'mediaThumbnail' ? 'image' : kind
  return {
    uploader,
    fileInputRef,
    dragHandler,
    onFileChange,
    runFiles,
    mimeTypes: fileUploader.fileTypes?.[fileTypesKey]?.mimeTypes,
  }
}
