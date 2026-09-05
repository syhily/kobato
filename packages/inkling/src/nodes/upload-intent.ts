import { $getNodeByKey, type LexicalEditor, type LexicalNode, type NodeKey } from 'lexical'

import type { GalleryImage } from '@/types/gallery'

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
} from '@/nodes/base'
import { getAudioMetadata } from '@/utils/getAudioMetadata'
import { getImageDimensions } from '@/utils/getImageDimensions'
import prettifyFileName from '@/utils/prettifyFileName'
import { createPreviewLease, type PreviewLeasePool } from '@/utils/preview-lease'

/**
 * The one upload-intent module (plan 045): file(s) + per-card metadata
 * extraction in, typed node patch out through plan 044's write seam
 * ($updateCardNode). The object-URL preview lifecycle is leased from the
 * preview-lease module — each intent leases its preview on start and
 * releases it on settle. The six near-clone upload flows (image/audio/
 * file/thumbnail handlers plus video's and gallery's inline
 * re-implementations) are configurations of these primitives — per-card
 * variance (metadata extraction, empty-result policy, the pre-upload src
 * reset) stays per-card data, never a copied skeleton.
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
  /** The leased preview URL when `leasePreview` is set, else null. */
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

export interface RunUploadIntentOptions<TNode extends LexicalNode, TMeta = undefined> {
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
  /** Lease an object URL for `files[0]` for the duration of the intent (image's preview, audio's metadata URL). */
  leasePreview?: boolean
  /** Publishes the leased URL on the node through the seam (image's `previewSrc`). */
  previewPatch?: (node: TNode, url: string) => void
  /** Pre-extracted metadata, when extraction happens outside the runner (video's caught `extractVideoMetadata`). */
  meta?: TMeta
  /**
   * Per-card metadata extraction. `beforeUpload` (default) runs it after the
   * preview lease and before the upload (image's dimensions); `afterUpload`
   * runs it only after a non-empty result (audio's duration, custom
   * thumbnail's dimensions from the result URL).
   */
  extractMetadata?: (context: ExtractMetadataContext) => Promise<TMeta>
  metadataTiming?: 'beforeUpload' | 'afterUpload'
  /** What counts as an empty upload result. Default: no first result url. */
  isEmptyResult?: (result: UploadResultItem[] | undefined) => boolean
  /**
   * The empty-result policy: `'bail'` leaves the node untouched (audio, file,
   * thumbnails, video); `'patch'` writes the patch anyway (image's
   * `src: ''`).
   */
  onEmptyResult: 'bail' | 'patch'
  /** Called when the flow bails on an empty result (video clears its preview). */
  onBail?: () => void
  /** The result patch, applied through plan 044's write seam. */
  patch: (node: TNode, context: PatchContext<TMeta>) => void
}

/**
 * Runs one upload intent: null-guard → `prePatch` → preview lease (+ publish)
 * → `beforeUpload` extraction → upload → empty-result policy → `afterUpload`
 * extraction → `patch` through 044's seam. The lease is released in a
 * `finally` around the whole flow, and rejections always propagate (per-card
 * pinned policy).
 *
 * Returns the first result URL (`undefined` when the flow bailed) so callers
 * can compose follow-up intents imperatively (video's thumbnail sub-flow).
 */
export async function runUploadIntent<TNode extends LexicalNode, TMeta = undefined>({
  editor,
  nodeKey,
  guard,
  files,
  upload,
  uploadOptions,
  prePatch,
  leasePreview,
  previewPatch,
  meta,
  extractMetadata,
  metadataTiming = 'beforeUpload',
  isEmptyResult = (result) => !result?.[0]?.url,
  onEmptyResult,
  onBail,
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
    // the microtask yields are load-bearing: Lexical 0.46 commits state on a
    // microtask, and the reset must be visible BEFORE the upload begins
    // (the prePatch is the early src reset the preview/progress UX reads —
    // pinned by headerBackgroundUploadIntent.test.ts)
    editor.update(() => {
      $updateCardNode(nodeKey, guard, prePatch)
    })
    await Promise.resolve()
  }

  const lease = leasePreview ? createPreviewLease(file) : null

  try {
    if (lease && previewPatch) {
      editor.update(() => {
        $updateCardNode(nodeKey, guard, (node) => {
          previewPatch(node, lease.url)
        })
      })
      await Promise.resolve()
    }

    let extracted = meta
    if (extractMetadata && metadataTiming === 'beforeUpload') {
      extracted = await extractMetadata({ file, previewUrl: lease?.url ?? null, resultUrl: undefined })
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

    if (isEmptyResult(result) && onEmptyResult === 'bail') {
      onBail?.()
      return undefined
    }

    if (extractMetadata && metadataTiming === 'afterUpload') {
      extracted = await extractMetadata({ file, previewUrl: lease?.url ?? null, resultUrl })
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

function requireUploadValue<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`Upload intent did not produce ${description}`)
  }
  return value
}

/* ------------------------------------------------------------------------ */
/* Per-card intent configurations — the Step-1 policy matrix as data. Each   */
/* factory is the card's metadata extraction + empty-result policy (+ the    */
/* pre-upload src reset where the card has one) bound to the runner; the     */
/* four handler modules these replace were deleted in the same commit.       */
/* ------------------------------------------------------------------------ */

export interface CardUploadIntentDeps {
  editor: LexicalEditor
  nodeKey: NodeKey
  upload: UploadFn
  files: FileList | File[] | null
}

/**
 * Image: object-URL preview published as `previewSrc`, dimensions extracted
 * from the preview before the upload, and the patch ALWAYS lands — an empty
 * result still writes `src: ''` and clears the preview. Rejections propagate;
 * the lease is released in `finally`.
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
    leasePreview: true,
    previewPatch: (node, url) => {
      node.previewSrc = url
    },
    extractMetadata: ({ previewUrl }) =>
      getImageDimensions(requireUploadValue(previewUrl ?? undefined, 'a preview URL')),
    onEmptyResult: 'patch',
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
 * Audio: object URL leased for metadata only (never published on the node),
 * upload FIRST, and bail with the node untouched when no url comes back; only
 * then extract duration/title/mimeType and patch. Rejections propagate; the
 * lease is released in `finally`.
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
    leasePreview: true,
    metadataTiming: 'afterUpload',
    extractMetadata: async ({ file, previewUrl }) => {
      const { duration } = await getAudioMetadata(requireUploadValue(previewUrl ?? undefined, 'a preview URL'))
      return {
        duration,
        mimeType: file.type,
        title: prettifyFileName(file.name),
      }
    },
    onEmptyResult: 'bail',
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
 * File: no object URL at all. Bails (node untouched beyond `prePatch`) when
 * the result is missing or has no first item, but a first item without a url
 * still patches with `src: ''`.
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
    isEmptyResult: (result) => !result || !result[0],
    onEmptyResult: 'bail',
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
    onEmptyResult: 'bail',
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
 * Video main flow: metadata arrives pre-extracted (`extractVideoMetadata`
 * runs in the component, where its failure is caught and surfaced). An empty
 * result bails with the node untouched and clears the component-owned preview
 * via `onEmptyPreview`; the patch backfills thumbnail dimensions only when no
 * custom thumbnail is set. Returns the uploaded video url for the thumbnail
 * sub-flow.
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
    meta,
    onEmptyResult: 'bail',
    onBail: onEmptyPreview,
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
    onEmptyResult: 'bail',
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
 * The one video upload flow: main upload first, then — only when the main
 * upload produced a url AND the metadata carries a thumbnail blob — the
 * thumbnail sub-flow. An empty main result bails both flows and clears the
 * component-owned preview via `onEmptyPreview` (the ordering the video
 * component used to own inline). Returns the uploaded video url.
 */
export async function videoFlowUploadIntent({
  editor,
  nodeKey,
  videoUpload,
  thumbnailUpload,
  files,
  meta,
  onEmptyPreview,
}: {
  editor: LexicalEditor
  nodeKey: NodeKey
  videoUpload: UploadFn
  thumbnailUpload: UploadFn
  files: FileList | File[]
  meta: VideoFlowMetadata
  onEmptyPreview: () => void
}): Promise<string | undefined> {
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
 * Video custom thumbnail: no preview lease; dimensions come from the RESULT
 * url after a non-empty upload; writes `customThumbnailSrc` plus the
 * thumbnail dimensions.
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
    metadataTiming: 'afterUpload',
    extractMetadata: ({ resultUrl }) => getImageDimensions(requireUploadValue(resultUrl, 'a result URL')),
    onEmptyResult: 'bail',
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
 * `backgroundImageSrc`; dimensions come from the RESULT url after a
 * non-empty upload; the patch ALWAYS lands — an empty result still writes
 * `src: ''` with zeroed dimensions (the replaced handler's bail path).
 * Rejections propagate.
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
    metadataTiming: 'afterUpload',
    // the patch-always policy means extraction also sees the empty result —
    // like the replaced handler, dimensions are only read from a real url
    extractMetadata: ({ resultUrl }) => (resultUrl ? getImageDimensions(resultUrl) : Promise.resolve(undefined)),
    onEmptyResult: 'patch',
    patch: (node, { meta, resultUrl }) => {
      node.backgroundImageSrc = resultUrl ?? ''
      node.backgroundImageWidth = meta?.width ?? 0
      node.backgroundImageHeight = meta?.height ?? 0
    },
  })
}

/* ------------------------------------------------------------------------ */
/* Gallery's multi-file adapter. The single-intent runner cannot express     */
/* this flow without distortion: previews are per-file, publish to the       */
/* gallery images mirror's LOCAL overlay (never the node) before the batched */
/* upload, results merge back by fileName, and the failure path cleans up    */
/* in-flow instead of propagating. The adapter keeps the pinned ordering —   */
/* previews to the overlay first, the node write (the mirror's setImages,    */
/* through 044's seam) only after the upload resolves — so in-flight         */
/* uploads stay reorderable by previewSrc with stable image identity         */
/* (useGalleryReorder).                                                      */
/* ------------------------------------------------------------------------ */

export interface GalleryUploadIntentDeps {
  upload: UploadFn
  files: FileList | File[]
  /** The card's current rendered images (the gallery images mirror's snapshot). */
  images: GalleryImage[]
  /** The component's preview pool — per-file previews lease from the one owner. */
  previews: PreviewLeasePool
  /** Preview publication lands here FIRST — the mirror's local overlay, never the node. */
  setPreviewImages: (images: GalleryImage[]) => void
  /** The result merge lands here — the mirror's local-and-node setter (044's seam). */
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

  // create preview images and capture dimensions
  for (const file of strippedFiles) {
    const previewSrc = previews.lease(file)
    const { width, height } = await getImageDimensions(previewSrc)

    newImages.push({
      fileName: file.name,
      previewSrc,
      width,
      height,
    })
  }

  recalculateImageRows(newImages)

  // show preview images immediately
  setPreviewImages(newImages)

  // start uploads
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

    return {
      ...image,
      src: result.url,
      previewSrc: undefined,
    }
  })

  // merge the results into the rendered list and write the node
  setImages(uploadedImages)
}
