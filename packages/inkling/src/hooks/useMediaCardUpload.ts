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
import { type RefObject, useCallback, useRef } from 'react'
export type MediaUploadKind = 'image' | 'video' | 'audio' | 'file' | 'mediaThumbnail'
export type MediaUploader = ReturnType<FileUploader['useFileUpload']>
export function useMediaUploader(kind: MediaUploadKind): MediaUploader {
  const { fileUploader } = useInklingHostEssentials()
  // oxlint-disable-next-line react/hooks
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
  fileInputRef: RefObject<HTMLInputElement | null>
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const runFiles = useCallback(
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
    guard: (node: unknown): node is TriggerFileDialogCardNode =>
      typeof node === 'object' && node !== null && 'triggerFileDialog' in node && guard(node),
    fileInputRef,
    triggerFileDialog,
  })

  const onFileChange = useCallback(
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
