import type { GalleryImage } from '@kobato/inkling-internal/types/gallery'

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
} from '@kobato/inkling-internal/nodes/base'
import { getAudioMetadata } from '@kobato/inkling-internal/utils/get-audio-metadata'
import { getImageDimensions } from '@kobato/inkling-internal/utils/get-image-dimensions'
import prettifyFileName from '@kobato/inkling-internal/utils/prettify-file-name'
import { createPreviewLease, type PreviewLeasePool } from '@kobato/inkling-internal/utils/preview-lease'
import { $getNodeByKey, type LexicalEditor, type LexicalNode, type NodeKey } from 'lexical'

export interface UploadResultItem {
  url?: string
  fileName?: string
}

export type UploadFn = (
  files: FileList | File[],
  options?: { formData?: Record<string, string> },
) => Promise<UploadResultItem[] | undefined>

export interface UploadOptions {
  formData?: Record<string, string>
}

export interface ExtractMetadataContext {
  file: File

  previewUrl: string | null

  resultUrl: string | undefined
}

export interface PatchContext<TMeta> {
  meta: TMeta | undefined
  resultUrl: string | undefined
  result: UploadResultItem[] | undefined
  file: File
}

export interface UploadPreviewPolicy<TNode> {
  publish?: (node: TNode, url: string) => void
}

export type UploadMetadataPolicy<TMeta> =
  | { kind: 'preExtracted'; meta: TMeta }
  | {
      kind: 'extract'
      timing: 'beforeUpload' | 'afterUpload'
      extract: (context: ExtractMetadataContext) => Promise<TMeta>
    }

export type UploadEmptyResultPredicate = (result: UploadResultItem[] | undefined) => boolean

export type UploadEmptyResultPolicy =
  | { kind: 'patch' }
  | { kind: 'bail'; isEmptyResult?: UploadEmptyResultPredicate; onBail?: () => void }

const defaultIsEmptyResult: UploadEmptyResultPredicate = (result) => !result?.[0]?.url

interface UploadIntentBaseOptions<TNode extends LexicalNode> {
  editor: LexicalEditor
  nodeKey: NodeKey
  guard: (node: unknown) => node is TNode
  files: FileList | File[] | null
  upload: UploadFn
  uploadOptions?: UploadOptions | ((node: TNode | null) => UploadOptions)

  prePatch?: (node: TNode) => void
}

export interface RunUploadIntentOptions<
  TNode extends LexicalNode,
  TMeta = undefined,
> extends UploadIntentBaseOptions<TNode> {
  preview?: UploadPreviewPolicy<TNode>

  metadata?: UploadMetadataPolicy<TMeta>

  emptyResult: UploadEmptyResultPolicy

  patch: (node: TNode, context: PatchContext<TMeta>) => void
}

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

export interface CardUploadIntentDeps {
  editor: LexicalEditor
  nodeKey: NodeKey
  upload: UploadFn
  files: FileList | File[] | null
}
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

export interface VideoFlowMetadata extends VideoUploadMetadata {
  thumbnailBlob?: Blob | null
}

export interface VideoFlowUploadIntentDeps {
  editor: LexicalEditor
  nodeKey: NodeKey
  videoUpload: UploadFn
  thumbnailUpload: UploadFn
  files: FileList | File[]
  meta: VideoFlowMetadata
  onEmptyPreview: () => void
}

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

    prePatch: (node) => {
      node.backgroundImageSrc = ''
    },
    metadata: {
      kind: 'extract',
      timing: 'afterUpload',
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

export interface GalleryUploadIntentDeps {
  upload: UploadFn
  files: FileList | File[]

  images: GalleryImage[]

  previews: PreviewLeasePool

  setPreviewImages: (images: GalleryImage[]) => void
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

    return Object.assign({}, image, {
      src: result.url,
      previewSrc: undefined,
    })
  })

  setImages(uploadedImages)
}
