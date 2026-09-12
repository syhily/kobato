import type { NodeKey } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import type { FileUploader } from '@/inkling/context/InklingHostIntegrationContext'
import type { UseFileDragAndDropResult } from '@/inkling/hooks/useFileDragAndDrop'
import type { TriggerFileDialogCardNode } from '@/inkling/hooks/useTriggerFileDialog'
import type { UploadFn } from '@/inkling/nodes/upload-intent'

import { useInklingHostEssentials } from '@/inkling/context/InklingHostIntegrationContext'
import useFileDragAndDrop from '@/inkling/hooks/useFileDragAndDrop'
import { useInitialFileUpload } from '@/inkling/hooks/useInitialFileUpload'
import { useTriggerFileDialog } from '@/inkling/hooks/useTriggerFileDialog'

// Media-card upload wiring — the one owner of the per-channel skeleton the
// media cards used to hand-copy: the host uploader for one media kind, the
// file-drag handler, the initial-file kickoff, the insert-time file-dialog
// trigger, the hidden-input ref, and the change-event adapter. Per-card
// variance arrives as data: the card's intent call (`onFiles`, told which
// of the three sources fired — the input reset policies diverge per
// source), the initial-file readiness guard, the dialog trigger, and the
// drag-disabled gate. A card with several upload channels (audio's
// thumbnail, video's custom thumbnail) composes one hook per channel; the
// card's own intent calls stay with the card.

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

/** Which entry point fired: the hidden input, a file drop, or the initial file. */
export type MediaUploadSource = 'input' | 'drop' | 'initial'

export interface UseMediaCardUploadOptions<TNode> {
  kind: MediaUploadKind
  nodeKey: NodeKey
  /** The card-node type guard the dialog trigger narrows with (e.g. `$isImageNode`). */
  guard: (node: unknown) => node is TNode
  /** The card's intent call, given the channel's upload fn and the firing source. */
  onFiles: (files: FileList | File[] | null, upload: UploadFn, source: MediaUploadSource) => unknown
  /** Insert-time initial file (media cards constructed from a paste/drop). */
  initialFile?: File | null
  /** The card's own initial-file kickoff guard, as data (image `!src`, video `!isLoading`, …). Defaults to ready. */
  isReady?: (uploader: MediaUploader) => boolean
  /** Open the picker on insert (the card's transient flag). */
  triggerFileDialog?: boolean
  /** Disable the drag handler (audio's thumbnail channel gates on edit mode). */
  dragDisabled?: boolean
}

export interface UseMediaCardUploadResult {
  uploader: MediaUploader
  fileInputRef: React.RefObject<HTMLInputElement | null>
  dragHandler: UseFileDragAndDropResult
  onFileChange: (files: FileList | File[] | null) => void
  /** The intent runner itself — for out-of-band sources (image's data-URL migration uses 'initial'). */
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
    // composed runtime narrowing instead of a cast: `TNode` can't be
    // constrained to `TriggerFileDialogCardNode` — gallery/header guards
    // narrow to node types without `triggerFileDialog`, and the cards'
    // `triggerFileDialog?: boolean | undefined` property isn't assignable to
    // the interface's write-only setter under strict mode. The probe matches
    // the accessor the assembled card classes generate from the spec's
    // `accessor: true` entry, which every card passing `triggerFileDialog`
    // (image, audio, video, file, gallery) adopts.
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

  // a mediaThumbnail channel picks image files (the audio/video thumbnail
  // inputs), matching the cards' historical `fileTypes.image` lookups
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
