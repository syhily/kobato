import type { FileUploader } from '@kobato/inkling-internal/index'
import type { Equal, Expect, Extends } from '@kobato/inkling/tests/utils/type-pins'
import type { LexicalEditor, NodeKey } from 'lexical'

import {
  $isAudioNode,
  $isFileNode,
  $isHeaderNode,
  $isImageNode,
  $isVideoNode,
} from '@kobato/inkling-internal/nodes/base'
import {
  audioThumbnailUploadIntent,
  audioUploadIntent,
  customThumbnailUploadIntent,
  fileUploadIntent,
  headerBackgroundUploadIntent,
  imageUploadIntent,
  runUploadIntent,
  type UploadFn,
  videoFlowUploadIntent,
  videoThumbnailUploadIntent,
  videoUploadIntent,
} from '@kobato/inkling-internal/nodes/upload-intent'

declare const editor: LexicalEditor
declare const nodeKey: NodeKey
declare const upload: UploadFn
declare const files: File[]

type _HostUpload = ReturnType<FileUploader['useFileUpload']>['upload']
type _HostUploadAssignableToUploadFn = Expect<Extends<_HostUpload, UploadFn>>
type _UploadFnAssignableToHostUpload = Expect<Extends<UploadFn, _HostUpload>>

runUploadIntent({
  editor,
  nodeKey,
  guard: $isImageNode,
  files,
  upload,
  preview: {
    publish: (node, url) => {
      node.previewSrc = url
    },
  },
  metadata: {
    kind: 'extract',
    timing: 'beforeUpload',
    extract: async ({ previewUrl }) => ({ width: previewUrl ? 100 : 0, height: 200 }),
  },
  emptyResult: { kind: 'patch' },
  patch: (node, { meta, resultUrl }) => {
    type _InferredMeta = Expect<Equal<typeof meta, { width: number; height: number } | undefined>>
    node.width = meta?.width ?? 0
    node.src = resultUrl ?? ''
  },
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isAudioNode,
  files,
  upload,
  preview: {},
  metadata: {
    kind: 'extract',
    timing: 'afterUpload',
    extract: async () => ({ duration: 42 }),
  },
  emptyResult: { kind: 'bail' },
  patch: (_node, { meta }) => {
    type _InferredMeta = Expect<Equal<typeof meta, { duration: number } | undefined>>
  },
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isVideoNode,
  files,
  upload,
  metadata: { kind: 'preExtracted', meta: { duration: 3, width: 1, height: 2, mimeType: 'video/mp4' } },
  emptyResult: {
    kind: 'bail',
    onBail: () => {},
  },
  patch: (node, { meta }) => {
    type _InferredMeta = Expect<
      Equal<typeof meta, { duration: number; width: number; height: number; mimeType: string } | undefined>
    >
    node.src = meta?.mimeType ?? ''
  },
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isFileNode,
  files,
  upload,
  emptyResult: {
    kind: 'bail',
    isEmptyResult: (result) => !result?.[0],
  },
  patch: (_node, { meta }) => {
    type _InferredMeta = Expect<Equal<typeof meta, undefined>>
  },
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isHeaderNode,
  files,
  upload,
  metadata: {
    kind: 'extract',
    timing: 'afterUpload',
    extract: async ({ resultUrl }) => (resultUrl ? { width: 1, height: 2 } : undefined),
  },
  emptyResult: { kind: 'patch' },
  patch: (_node, { meta }) => {
    type _InferredMeta = Expect<Equal<typeof meta, { width: number; height: number } | undefined>>
  },
})

void imageUploadIntent({ editor, nodeKey, upload, files })
void audioUploadIntent({ editor, nodeKey, upload, files })
void fileUploadIntent({ editor, nodeKey, upload, files })
void audioThumbnailUploadIntent({ editor, nodeKey, upload, files })
void videoUploadIntent({
  editor,
  nodeKey,
  upload,
  files,
  meta: { duration: 3, width: 1, height: 2, mimeType: 'video/mp4' },
  onEmptyPreview: () => {},
})
void videoThumbnailUploadIntent({ editor, nodeKey, upload, files, videoUrl: 'https://example.com/v.mp4' })
void customThumbnailUploadIntent({ editor, nodeKey, upload, files })
void headerBackgroundUploadIntent({ editor, nodeKey, upload, files })
void videoFlowUploadIntent({
  editor,
  nodeKey,
  videoUpload: upload,
  thumbnailUpload: upload,
  files,
  meta: { duration: 3, width: 1, height: 2, mimeType: 'video/mp4', thumbnailBlob: null },
  onEmptyPreview: () => {},
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isImageNode,
  files,
  upload,
  // @ts-expect-error - there is no top-level previewPatch; a publish lives inside the lease policy
  previewPatch: () => {},
  emptyResult: { kind: 'patch' },
  patch: () => {},
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isImageNode,
  files,
  upload,
  // @ts-expect-error - there is no top-level metadataTiming; timing lives inside the extract policy
  metadataTiming: 'afterUpload',
  emptyResult: { kind: 'bail' },
  patch: () => {},
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isImageNode,
  files,
  upload,
  // @ts-expect-error - onBail belongs to the bail policy only
  emptyResult: { kind: 'patch', onBail: () => {} },
  patch: () => {},
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isImageNode,
  files,
  upload,
  // @ts-expect-error - isEmptyResult belongs to the bail policy only
  emptyResult: { kind: 'patch', isEmptyResult: () => true },
  patch: () => {},
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isVideoNode,
  files,
  upload,
  metadata: {
    kind: 'preExtracted',
    meta: { duration: 3 },
    // @ts-expect-error - pre-extracted metadata and an extractor are mutually exclusive
    extract: async () => ({ duration: 4 }),
  },
  emptyResult: { kind: 'bail' },
  patch: () => {},
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isVideoNode,
  files,
  upload,
  metadata: {
    kind: 'extract',
    timing: 'afterUpload',
    extract: async () => ({ duration: 4 }),
    // @ts-expect-error - an extractor policy cannot also carry pre-extracted metadata
    meta: { duration: 3 },
  },
  emptyResult: { kind: 'bail' },
  patch: () => {},
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isVideoNode,
  files,
  upload,
  // @ts-expect-error - `extract` is required whenever a timing is present
  metadata: { kind: 'extract', timing: 'afterUpload' },
  emptyResult: { kind: 'bail' },
  patch: () => {},
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isVideoNode,
  files,
  upload,
  // @ts-expect-error - the metadata policy is discriminated; a bare value has no valid shape
  metadata: { meta: { duration: 3 } },
  emptyResult: { kind: 'bail' },
  patch: () => {},
})

// @ts-expect-error - emptyResult is required
runUploadIntent({
  editor,
  nodeKey,
  guard: $isImageNode,
  files,
  upload,
  patch: () => {},
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isImageNode,
  files,
  upload,
  emptyResult: { kind: 'patch' },
  patch: (_node, { meta }) => {
    // @ts-expect-error - no metadata policy means meta is undefined
    const inferred: { width: number; height: number } = meta
    void inferred
  },
})

runUploadIntent({
  editor,
  nodeKey,
  guard: $isVideoNode,
  files,
  upload,
  preview: {
    publish: (_node, url) => {
      // @ts-expect-error - TNode is the video node; image fields do not exist on it
      void (_node.previewSrc = url)
    },
  },
  emptyResult: { kind: 'bail' },
  patch: () => {},
})
