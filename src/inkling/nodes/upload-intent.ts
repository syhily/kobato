import { $getNodeByKey, type LexicalEditor, type LexicalNode, type NodeKey } from 'lexical'

import type { GalleryImage } from '@/inkling/types/gallery'

import {
  $isAudioNode,
  $isFileNode,
  $isHeaderNode,
  $isImageNode,
  $isVideoNode,
  $updateCardNode,
  MAX_IMAGES,
  recalculateImageRows,
  type BaseFileNode,
  type BaseImageNode,
} from '@/inkling/nodes/base'
import { getAudioMetadata } from '@/inkling/utils/getAudioMetadata'
import { getImageDimensions } from '@/inkling/utils/getImageDimensions'
import prettifyFileName from '@/inkling/utils/prettifyFileName'
import { createPreviewLease, type PreviewLeasePool } from '@/inkling/utils/preview-lease'

/**
 * The one upload-intent module: file(s) + per-card metadata extraction in, typed node
 * patch out through the write seam ($updateCardNode). Previews lease from the
 * preview-lease module (lease on start, release on settle). Per-card variance is
 * expressed as three small policy unions (preview / metadata / empty-result), each
 * closed over its valid shapes, so combinations the runner would silently ignore — a
 * publish without a lease, an after-upload timing without an extractor, an `onBail`
 * hook under the patch policy, pre-extracted metadata alongside an extractor — do not
 * compile (tests/inkling/typecheck/upload-intent-options.ts).
 */

export interface UploadResultItem {
  url?: string
  fileName?: string
}

/**
 * The single home of the uploader signature — plain and `formData`-carrying
 * calls (thumbnail/video sub-flows) share it. Matches the host-provided
 * `FileUploader['useFileUpload']` upload.
 */
export type UploadFn = (
  files: FileList | File[],
  options?: { formData?: Record<string, string> },
) => Promise<UploadResultItem[] | undefined>

export interface UploadOptions {
  formData?: Record<string, string>
}

export interface ExtractMetadataContext {
  file: File
  /** The leased preview URL when a `preview` policy is set, else null. */
  previewUrl: string | null
  /** The first upload result URL; only set for `afterUpload` extraction. */
  resultUrl: string | undefined
}

export interface PatchContext<TMeta> {
  meta: TMeta | undefined
  resultUrl: string | undefined
  result: UploadResultItem[] | undefined
  file: File
}

/**
 * Preview policy. The PRESENCE of this policy is the lease request: an object
 * URL is created for `files[0]` before any extraction and released in the
 * runner's `finally`. `publish` pushes the leased URL onto the node through
 * the seam (image's `previewSrc`); omitting it keeps the lease metadata-only
 * (audio's duration URL). There is no publish-without-lease shape.
 */
export interface UploadPreviewPolicy<TNode> {
  publish?: (node: TNode, url: string) => void
}

/**
 * Metadata policy: exactly one of three shapes, so the runner never carries a
 * timing it cannot use and never has to choose between pre-extracted and
 * extracted metadata.
 *
 * - `preExtracted` — extraction happened outside the runner and its result is
 *   handed in (video's caught `extractVideoMetadata`).
 * - `extract` + `beforeUpload` — runs after the preview lease and before the
 *   upload (image dimensions from the preview URL).
 * - `extract` + `afterUpload` — runs only after a non-empty result (audio
 *   duration, custom-thumbnail/header dimensions from the result URL).
 */
export type UploadMetadataPolicy<TMeta> =
  | { kind: 'preExtracted'; meta: TMeta }
  | {
      kind: 'extract'
      timing: 'beforeUpload' | 'afterUpload'
      extract: (context: ExtractMetadataContext) => Promise<TMeta>
    }

/** What counts as an empty upload result. Default: no first result url. */
export type UploadEmptyResultPredicate = (result: UploadResultItem[] | undefined) => boolean

/**
 * The empty-result policy. `patch` always writes the patch (image's `src: ''`,
 * header's zeroed dimensions), so it has no predicate; `bail` leaves the node
 * untouched beyond `prePatch` (audio, file, thumbnails, video) and is the only
 * shape that can carry a custom emptiness predicate or an `onBail` hook (video
 * clears its component-owned preview).
 */
export type UploadEmptyResultPolicy =
  | { kind: 'patch' }
  | { kind: 'bail'; isEmptyResult?: UploadEmptyResultPredicate; onBail?: () => void }

/** Default emptiness predicate for the bail policy: no first result url. */
const defaultIsEmptyResult: UploadEmptyResultPredicate = (result) => !result?.[0]?.url

/**
 * The policy-free half of an intent — the editor seam and upload plumbing every
 * card shares. Split out so `RunUploadIntentOptions` reads as the three
 * policies plus `patch`.
 */
interface UploadIntentBaseOptions<TNode extends LexicalNode> {
  editor: LexicalEditor
  nodeKey: NodeKey
  /** The card-node type guard the typed seam narrows with (e.g. `$isImageNode`). */
  guard: (node: unknown) => node is TNode
  files: FileList | File[] | null
  upload: UploadFn
  /** Extra upload options, or a resolver computing them off the current node — called inside an editor read (audio thumbnail's `formData` url). */
  uploadOptions?: UploadOptions | ((node: TNode | null) => UploadOptions)
  /** Pre-upload node patch applied through the seam (the `onFileChange` src reset). */
  prePatch?: (node: TNode) => void
}

export interface RunUploadIntentOptions<
  TNode extends LexicalNode,
  TMeta = undefined,
> extends UploadIntentBaseOptions<TNode> {
  /** Lease a preview for `files[0]`, optionally published on the node. Absent = no lease. */
  preview?: UploadPreviewPolicy<TNode>
  /** Carry pre-extracted metadata or extract it (before or after the upload). Absent = no metadata. */
  metadata?: UploadMetadataPolicy<TMeta>
  /** Required: every card declares what an empty result means. */
  emptyResult: UploadEmptyResultPolicy
  /** The result patch, applied through the write seam. */
  patch: (node: TNode, context: PatchContext<TMeta>) => void
}

/**
 * Runs one upload intent: null/file guard → `prePatch` → preview lease (+
 * publish) → `beforeUpload` extraction → upload → empty-result policy →
 * `afterUpload` extraction → `patch` through the write seam. The lease is
 * released in a `finally` around the whole flow; rejections always propagate.
 *
 * INTERNAL seam the per-card factories bind to, deliberately not on the public
 * `@/inkling` surface. Returns the first result URL (`undefined` when the flow
 * bailed) so callers can compose follow-up intents imperatively.
 */
export async function runUploadIntent<TNode extends LexicalNode, TMeta = undefined>({
  editor,
  nodeKey,
  guard,
  files,
  upload,
  uploadOptions,
  prePatch,
  preview,
  metadata,
  emptyResult,
  patch,
}: RunUploadIntentOptions<TNode, TMeta>): Promise<string | undefined> {
  if (!files) {
    return undefined
  }

  const file = files[0]
  if (!file) {
    return undefined
  }

  if (prePatch) {
    // the microtask yields are load-bearing: Lexical commits non-discrete
    // updates on a microtask, and the reset must be visible BEFORE the upload
    // begins (the prePatch is the early src reset the preview/progress UX reads)
    editor.update(() => {
      $updateCardNode(nodeKey, guard, prePatch)
    })
    await Promise.resolve()
  }

  const lease = preview ? createPreviewLease(file) : null
  const publish = preview?.publish

  try {
    if (lease && publish) {
      editor.update(() => {
        $updateCardNode(nodeKey, guard, (node) => {
          publish(node, lease.url)
        })
      })
      await Promise.resolve()
    }

    let extracted = metadata?.kind === 'preExtracted' ? metadata.meta : undefined
    if (metadata?.kind === 'extract' && metadata.timing === 'beforeUpload') {
      extracted = await metadata.extract({ file, previewUrl: lease?.url ?? null, resultUrl: undefined })
    }

    const resolvedUploadOptions =
      typeof uploadOptions === 'function'
        ? editor.getEditorState().read(() => {
            const node = $getNodeByKey(nodeKey)
            return uploadOptions(guard(node) ? node : null)
          })
        : uploadOptions
    // one-arg call when the card carries no upload options — the pinned
    // handlers' call arity (upload(files) vs upload(files, options)) is part
    // of the per-card contract
    const result = resolvedUploadOptions ? await upload(files, resolvedUploadOptions) : await upload(files)
    const resultUrl = result?.[0]?.url

    if (emptyResult.kind === 'bail') {
      const isEmptyResultPredicate = emptyResult.isEmptyResult ?? defaultIsEmptyResult
      if (isEmptyResultPredicate(result)) {
        emptyResult.onBail?.()
        return undefined
      }
    }

    if (metadata?.kind === 'extract' && metadata.timing === 'afterUpload') {
      extracted = await metadata.extract({ file, previewUrl: lease?.url ?? null, resultUrl })
    }

    editor.update(() => {
      $updateCardNode(nodeKey, guard, (node) => {
        patch(node, { meta: extracted, resultUrl, result, file })
      })
    })
    await Promise.resolve()

    return resultUrl
  } finally {
    lease?.release()
  }
}

function requireUploadValue<T>(value: T | null | undefined, description: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Upload intent did not produce ${description}`)
  }
  return value
}

// Per-card intent configurations: each factory binds one card's preview /
// metadata / empty-result policies (plus the pre-upload src reset where the
// card has one) to the runner. Card variance stays data here; the write order
// and the preview-lease lifecycle stay in the runner above.

export interface CardUploadIntentDeps {
  editor: LexicalEditor
  nodeKey: NodeKey
  upload: UploadFn
  files: FileList | File[] | null
}

/**
 * Image: preview published as `previewSrc`, dimensions extracted from the preview
 * before the upload; the patch ALWAYS lands — an empty result still writes `src: ''`
 * and clears the preview.
 */
export function imageUploadIntent({
  editor,
  nodeKey,
  upload,
  files,
  prePatch,
}: CardUploadIntentDeps & { prePatch?: (node: BaseImageNode) => void }): Promise<string | undefined> {
  return runUploadIntent({
    editor,
    nodeKey,
    guard: $isImageNode,
    files,
    upload,
    prePatch,
    preview: {
      publish: (node, url) => {
        node.previewSrc = url
      },
    },
    metadata: {
      kind: 'extract',
      timing: 'beforeUpload',
      extract: ({ previewUrl }) => getImageDimensions(requireUploadValue(previewUrl, 'a preview URL')),
    },
    emptyResult: { kind: 'patch' },
    patch: (node, { meta, resultUrl }) => {
      const dimensions = requireUploadValue(meta, 'image metadata')
      node.width = dimensions.width
      node.height = dimensions.height
      node.src = resultUrl ?? ''
      node.previewSrc = null
    },
  })
}

/**
 * Audio: object URL leased for metadata only (never published on the node), upload
 * FIRST, bail with the node untouched when no url comes back, then extract and patch.
 */
export function audioUploadIntent({
  editor,
  nodeKey,
  upload,
  files,
}: CardUploadIntentDeps): Promise<string | undefined> {
  return runUploadIntent({
    editor,
    nodeKey,
    guard: $isAudioNode,
    files,
    upload,
    // a metadata-only lease — no publish
    preview: {},
    metadata: {
      kind: 'extract',
      timing: 'afterUpload',
      extract: async ({ file, previewUrl }) => {
        const { duration } = await getAudioMetadata(requireUploadValue(previewUrl, 'a preview URL'))
        return {
          duration,
          mimeType: file.type,
          title: prettifyFileName(file.name),
        }
      },
    },
    emptyResult: { kind: 'bail' },
    patch: (node, { meta, resultUrl }) => {
      const metadata = requireUploadValue(meta, 'audio metadata')
      node.duration = metadata.duration
      node.src = resultUrl ?? ''
      node.mimeType = metadata.mimeType
      node.title = metadata.title
    },
  })
}

const stripFileExtension = (fileName: string): string => {
  const fileExtension = fileName.split('.').pop() ?? ''
  const fileNameWithoutExtension = fileName.replace(`.${fileExtension}`, '')
  return fileNameWithoutExtension
}

/**
 * File: no object URL. Bails (node untouched beyond `prePatch`) when the result is
 * missing or has no first item, but a first item without a url still patches with
 * `src: ''`.
 */
export function fileUploadIntent({
  editor,
  nodeKey,
  upload,
  files,
  prePatch,
}: CardUploadIntentDeps & { prePatch?: (node: BaseFileNode) => void }): Promise<string | undefined> {
  return runUploadIntent({
    editor,
    nodeKey,
    guard: $isFileNode,
    files,
    upload,
    prePatch,
    emptyResult: {
      kind: 'bail',
      isEmptyResult: (result) => !result?.[0],
    },
    patch: (node, { resultUrl, file }) => {
      const fileName = file.name
      node.fileTitle = stripFileExtension(fileName)
      node.fileName = fileName
      node.fileSize = file.size
      node.src = resultUrl ?? ''
    },
  })
}

/**
 * Audio thumbnail: reads the current `node.src` and passes it as
 * `formData: { url }`; writes `thumbnailSrc` only when a url comes back.
 */
export function audioThumbnailUploadIntent({
  editor,
  nodeKey,
  upload,
  files,
}: CardUploadIntentDeps): Promise<string | undefined> {
  return runUploadIntent({
    editor,
    nodeKey,
    guard: $isAudioNode,
    files,
    upload,
    uploadOptions: (node) => ({ formData: { url: node?.src ?? '' } }),
    emptyResult: { kind: 'bail' },
    patch: (node, { resultUrl }) => {
      node.thumbnailSrc = resultUrl ?? ''
    },
  })
}

export interface VideoUploadMetadata {
  duration: number
  width: number
  height: number
  mimeType: string
}

/**
 * Video main flow: metadata arrives pre-extracted (`extractVideoMetadata` runs in
 * the component, where its failure is caught and surfaced). An empty result bails
 * and clears the component-owned preview via `onEmptyPreview`; the patch backfills
 * thumbnail dimensions only when no custom thumbnail is set.
 */
export function videoUploadIntent({
  editor,
  nodeKey,
  upload,
  files,
  meta,
  onEmptyPreview,
}: CardUploadIntentDeps & { meta: VideoUploadMetadata; onEmptyPreview: () => void }): Promise<string | undefined> {
  return runUploadIntent({
    editor,
    nodeKey,
    guard: $isVideoNode,
    files,
    upload,
    metadata: { kind: 'preExtracted', meta },
    emptyResult: {
      kind: 'bail',
      onBail: onEmptyPreview,
    },
    patch: (node, { resultUrl, file }) => {
      node.src = resultUrl ?? ''
      node.duration = meta.duration
      node.fileName = file.name
      node.width = meta.width
      node.height = meta.height
      node.mimeType = meta.mimeType
      if (!node.customThumbnailSrc) {
        node.thumbnailWidth = meta.width
        node.thumbnailHeight = meta.height
      }
    },
  })
}

/**
 * Video thumbnail sub-flow: uploads the synthesized `${file.name}.jpg` via
 * the `mediaThumbnail` uploader with `formData: { url: videoUrl }`; writes
 * `thumbnailSrc` only when a url comes back.
 */
export function videoThumbnailUploadIntent({
  editor,
  nodeKey,
  upload,
  files,
  videoUrl,
}: CardUploadIntentDeps & { videoUrl: string }): Promise<string | undefined> {
  return runUploadIntent({
    editor,
    nodeKey,
    guard: $isVideoNode,
    files,
    upload,
    uploadOptions: { formData: { url: videoUrl } },
    emptyResult: { kind: 'bail' },
    patch: (node, { resultUrl }) => {
      node.thumbnailSrc = resultUrl ?? ''
    },
  })
}

/**
 * The video flow's metadata: the main flow's fields plus the thumbnail
 * blob the sub-flow synthesizes into `${file.name}.jpg`.
 */
export interface VideoFlowMetadata extends VideoUploadMetadata {
  thumbnailBlob?: Blob | null
}

/**
 * The deps for the video flow intent — two uploaders (main video + synthesized
 * thumbnail), non-null files, and the pre-extracted flow metadata.
 */
export interface VideoFlowUploadIntentDeps {
  editor: LexicalEditor
  nodeKey: NodeKey
  videoUpload: UploadFn
  thumbnailUpload: UploadFn
  files: FileList | File[]
  meta: VideoFlowMetadata
  onEmptyPreview: () => void
}

/**
 * The one video upload flow: main upload first, then — only when the main
 * upload produced a url AND the metadata carries a thumbnail blob — the
 * thumbnail sub-flow. An empty main result bails both flows and clears the
 * component-owned preview via `onEmptyPreview`. Returns the uploaded video url.
 */
export async function videoFlowUploadIntent({
  editor,
  nodeKey,
  videoUpload,
  thumbnailUpload,
  files,
  meta,
  onEmptyPreview,
}: VideoFlowUploadIntentDeps): Promise<string | undefined> {
  const file = files[0]
  if (!file) {
    return undefined
  }

  const videoUrl = await videoUploadIntent({
    editor,
    nodeKey,
    upload: videoUpload,
    files: [file],
    meta,
    onEmptyPreview,
  })

  if (!videoUrl || !meta.thumbnailBlob) {
    return videoUrl
  }

  const thumbnailFile = new File([meta.thumbnailBlob], `${file.name}.jpg`, { type: 'image/jpeg' })
  await videoThumbnailUploadIntent({
    editor,
    nodeKey,
    upload: thumbnailUpload,
    files: [thumbnailFile],
    videoUrl,
  })

  return videoUrl
}

/**
 * Video custom thumbnail: no preview lease; dimensions come from the RESULT url
 * after a non-empty upload.
 */
export function customThumbnailUploadIntent({
  editor,
  nodeKey,
  upload,
  files,
}: CardUploadIntentDeps): Promise<string | undefined> {
  return runUploadIntent({
    editor,
    nodeKey,
    guard: $isVideoNode,
    files,
    upload,
    metadata: {
      kind: 'extract',
      timing: 'afterUpload',
      extract: ({ resultUrl }) => getImageDimensions(requireUploadValue(resultUrl, 'a result URL')),
    },
    emptyResult: { kind: 'bail' },
    patch: (node, { meta, resultUrl }) => {
      const dimensions = requireUploadValue(meta, 'thumbnail metadata')
      node.customThumbnailSrc = resultUrl ?? ''
      node.thumbnailWidth = dimensions.width
      node.thumbnailHeight = dimensions.height
    },
  })
}

/**
 * Header background image: the pre-upload src reset clears the node's
 * `backgroundImageSrc`; dimensions come from the RESULT url; the patch ALWAYS
 * lands — an empty result still writes `src: ''` with zeroed dimensions.
 */
export function headerBackgroundUploadIntent({
  editor,
  nodeKey,
  upload,
  files,
}: CardUploadIntentDeps): Promise<string | undefined> {
  return runUploadIntent({
    editor,
    nodeKey,
    guard: $isHeaderNode,
    files,
    upload,
    // reset original src so it can be replaced by the upload result
    prePatch: (node) => {
      node.backgroundImageSrc = ''
    },
    metadata: {
      kind: 'extract',
      timing: 'afterUpload',
      // the patch-always policy means extraction also sees the empty result —
      // dimensions are only read from a real url
      extract: ({ resultUrl }) => (resultUrl ? getImageDimensions(resultUrl) : Promise.resolve(undefined)),
    },
    emptyResult: { kind: 'patch' },
    patch: (node, { meta, resultUrl }) => {
      node.backgroundImageSrc = resultUrl ?? ''
      node.backgroundImageWidth = meta?.width ?? 0
      node.backgroundImageHeight = meta?.height ?? 0
    },
  })
}

// Gallery's multi-file adapter. The single-intent runner cannot express this
// flow: previews publish to the gallery images mirror's LOCAL overlay (never
// the node) before the batched upload, results merge back by fileName, and
// the failure path cleans up in-flow instead of propagating. The node write
// (the mirror's setImages) lands only after the upload resolves, so in-flight
// uploads stay reorderable by previewSrc with stable image identity
// (useGalleryReorder).

export interface GalleryUploadIntentDeps {
  upload: UploadFn
  files: FileList | File[]
  /** The card's current rendered images (the gallery images mirror's snapshot). */
  images: GalleryImage[]
  /** The component's preview pool — per-file previews lease from the one owner. */
  previews: PreviewLeasePool
  /** Preview publication lands here FIRST — the mirror's local overlay, never the node. */
  setPreviewImages: (images: GalleryImage[]) => void
  /** The result merge lands here — the mirror's local-and-node setter. */
  setImages: (images: GalleryImage[]) => void
  setErrorMessage: (message: string) => void
}

function withoutPreviewSrc(image: GalleryImage): GalleryImage {
  const { previewSrc: _previewSrc, ...rest } = image
  return rest
}

export async function galleryUploadIntent({
  upload,
  files,
  images,
  previews,
  setPreviewImages,
  setImages,
  setErrorMessage,
}: GalleryUploadIntentDeps): Promise<void> {
  const currentCount = images.length
  const allowedCount = MAX_IMAGES - currentCount

  const strippedFiles = Array.from(files).slice(0, Math.max(0, allowedCount))
  if (strippedFiles.length < files.length) {
    setErrorMessage('Galleries are limited to 9 images')
  }

  if (strippedFiles.length === 0) {
    return
  }

  const newImages: GalleryImage[] = [...images]

  // create preview images and capture dimensions — the per-file decodes are
  // independent, so they run in parallel (map preserves the push order). A
  // rejection mid-batch must release exactly the leases this batch took
  // before propagating, or those previews stay leased-but-unrendered until
  // unmount
  const leasedPreviews: string[] = []
  try {
    const captured = await Promise.all(
      strippedFiles.map(async (file) => {
        const previewSrc = previews.lease(file)
        leasedPreviews.push(previewSrc)
        const { width, height } = await getImageDimensions(previewSrc)

        return {
          fileName: file.name,
          previewSrc,
          width,
          height,
        }
      }),
    )
    newImages.push(...captured)
  } catch (error) {
    leasedPreviews.forEach((previewSrc) => previews.release(previewSrc))
    throw error
  }

  recalculateImageRows(newImages)

  setPreviewImages(newImages)

  const uploadResult = await upload(strippedFiles)

  if (!uploadResult) {
    const cleanedImages = newImages.map((image, index) => (index < currentCount ? image : withoutPreviewSrc(image)))
    newImages.slice(currentCount).forEach((image) => {
      previews.release(image.previewSrc)
    })
    recalculateImageRows(cleanedImages)
    setImages(cleanedImages)
    setErrorMessage('Something went wrong while uploading images. Please refresh the page and try again')
    return
  }

  const uploadedImages = newImages.map((image, index) => {
    if (index < currentCount) {
      return image
    }

    const result = uploadResult.find((r) => r.fileName === image.fileName)
    if (!result) {
      return image
    }

    previews.release(image.previewSrc)

    // Object.assign, not spread: the overlay images are shared state, so the
    // merge must stay copy-on-write without allocating through a spread
    return Object.assign({}, image, {
      src: result.url,
      previewSrc: undefined,
    })
  })

  setImages(uploadedImages)
}
