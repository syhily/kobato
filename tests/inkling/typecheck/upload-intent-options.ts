/**
 * Compile-time pins for the upload-intent policy composition.
 *
 * The three policy unions (`preview` / `metadata` / `emptyResult`) reject
 * combinations that compile but can never take effect: a publish without a
 * lease, a timing without an extractor, an `onBail` under the patch policy,
 * pre-extracted `meta` alongside an extractor. The negative pins are the
 * regression guard; the positive pins keep every card variant and generic
 * `TNode`/`TMeta` inference ergonomic (no explicit type arguments, no casts).
 *
 * Type-checked only, never executed — the factory calls would start intents
 * if it ran.
 */
import type { LexicalEditor, NodeKey } from 'lexical'

import type { Equal, Expect, Extends } from '#/inkling/utils/type-pins'
import type { FileUploader } from '@/inkling/index'

import { $isAudioNode, $isFileNode, $isHeaderNode, $isImageNode, $isVideoNode } from '@/inkling/nodes/base'
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
} from '@/inkling/nodes/upload-intent'

declare const editor: LexicalEditor
declare const nodeKey: NodeKey
declare const upload: UploadFn
declare const files: File[]

// Host uploader contract

// The host's `FileUploader['useFileUpload']` upload is structurally identical
// to `UploadFn`: same `files`/`formData` parameters and the same
// `{ url?, fileName? }[] | undefined` result. No contravariance to excuse.
type _HostUpload = ReturnType<FileUploader['useFileUpload']>['upload']
type _HostUploadAssignableToUploadFn = Expect<Extends<_HostUpload, UploadFn>>
type _UploadFnAssignableToHostUpload = Expect<Extends<UploadFn, _HostUpload>>

// Positive variants

// image: lease + publish, before-upload extraction from the preview URL,
// patch-always — and TMeta inferred from the extractor, not annotated.
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

// audio: metadata-only lease (no publish), after-upload extraction, bail.
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

// video: pre-extracted metadata, bail with an onBail hook, TMeta inferred
// from the pre-extracted value.
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

// file: no preview, no metadata, a custom empty-result predicate under bail.
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

// header: patch-always with an after-upload extractor that may resolve
// undefined (the extractor opts out on an empty URL).
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

// every per-card factory still composes without explicit type arguments
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

// Negative pins: combinations that must not compile

// a publish without a lease — a top-level previewPatch would be silently ignored
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

// an after-upload timing with no extractor — the timing would never be read
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

// an onBail hook under the patch policy — the hook would never be called
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

// an emptiness predicate under the patch policy — patch applies unconditionally
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

// pre-extracted metadata alongside an extractor — one of the two would be ignored
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

// the same exclusion from the extract side
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

// a timing without an extractor — the extract policy requires the function
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

// a metadata policy without a kind is not a valid policy
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

// the empty-result policy is required (there is no implicit default)
// @ts-expect-error - emptyResult is required
runUploadIntent({
  editor,
  nodeKey,
  guard: $isImageNode,
  files,
  upload,
  patch: () => {},
})

// the inferred meta stays `undefined` when no metadata policy is supplied,
// so a patch cannot pretend metadata exists
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

// TNode stays inferred from the guard for both policies and the patch —
// an explicit mismatch is rejected rather than widened
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
