import { createHeadlessEditor } from '@lexical/headless'
import { $getNodeByKey, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import {
  customThumbnailUploadIntent,
  videoFlowUploadIntent,
  videoThumbnailUploadIntent,
  videoUploadIntent,
  type VideoFlowMetadata,
} from '@/nodes/upload-intent'
import { $createVideoNode, VideoNode, type VideoNode as VideoNodeType } from '@/nodes/VideoNode'
import { getImageDimensions } from '@/utils/getImageDimensions'

vi.mock('@/utils/getImageDimensions', () => ({
  getImageDimensions: vi.fn(),
}))

const META: VideoFlowMetadata = { duration: 12, width: 640, height: 360, mimeType: 'video/mp4' }
const META_WITH_BLOB: VideoFlowMetadata = { ...META, thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }) }

describe('video upload intents', () => {
  let editor: LexicalEditor
  let nodeKey: string

  beforeEach(async () => {
    editor = createHeadlessEditor({
      nodes: [VideoNode],
      onError: (error) => {
        throw error
      },
    })
    vi.mocked(getImageDimensions).mockResolvedValue({ width: 100, height: 50 })
    nodeKey = ''
    await updateEditor(editor, () => {
      const node = $createVideoNode({ src: '' })
      $getRoot().append(node)
      nodeKey = node.getKey()
    })
  })

  function readNode(): Record<string, unknown> {
    let snapshot: Record<string, unknown> = {}
    editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey) as VideoNodeType | null
      if (!node) {
        throw new Error('video node missing')
      }
      snapshot = {
        src: node.src,
        duration: node.duration,
        fileName: node.fileName,
        mimeType: node.mimeType,
        thumbnailSrc: node.thumbnailSrc,
        thumbnailWidth: node.thumbnailWidth,
        thumbnailHeight: node.thumbnailHeight,
        customThumbnailSrc: node.customThumbnailSrc,
      }
    })
    return snapshot
  }

  it('videoUploadIntent patches metadata and backfills thumbnail dimensions when no custom thumbnail', async () => {
    const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/video.mp4' }])
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })

    await videoUploadIntent({ editor, nodeKey, upload, files: [file], meta: META, onEmptyPreview: () => {} })

    const node = readNode()
    expect(node.src).toBe('https://example.com/video.mp4')
    expect(node.duration).toBe(12)
    expect(node.fileName).toBe('clip.mp4')
    expect(node.mimeType).toBe('video/mp4')
    expect(node.thumbnailWidth).toBe(640)
    expect(node.thumbnailHeight).toBe(360)
  })

  it('videoUploadIntent bails on an empty result and calls onEmptyPreview', async () => {
    const upload = vi.fn().mockResolvedValue(undefined)
    const onEmptyPreview = vi.fn()
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })

    const url = await videoUploadIntent({ editor, nodeKey, upload, files: [file], meta: META, onEmptyPreview })

    expect(url).toBeUndefined()
    expect(onEmptyPreview).toHaveBeenCalledOnce()
    expect(readNode().src).toBe('')
  })

  it('videoThumbnailUploadIntent passes the video url as formData and patches thumbnailSrc', async () => {
    const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/thumb.jpg' }])
    const file = new File(['thumb'], 'clip.mp4.jpg', { type: 'image/jpeg' })

    await videoThumbnailUploadIntent({
      editor,
      nodeKey,
      upload,
      files: [file],
      videoUrl: 'https://example.com/video.mp4',
    })

    expect(upload).toHaveBeenCalledExactlyOnceWith([file], { formData: { url: 'https://example.com/video.mp4' } })
    expect(readNode().thumbnailSrc).toBe('https://example.com/thumb.jpg')
  })

  it('videoThumbnailUploadIntent leaves thumbnailSrc alone on an empty result', async () => {
    const upload = vi.fn().mockResolvedValue(undefined)
    const file = new File(['thumb'], 'clip.mp4.jpg', { type: 'image/jpeg' })

    await videoThumbnailUploadIntent({
      editor,
      nodeKey,
      upload,
      files: [file],
      videoUrl: 'https://example.com/video.mp4',
    })

    expect(readNode().thumbnailSrc).toBe('')
  })

  it('customThumbnailUploadIntent reads dimensions from the result url and patches customThumbnailSrc', async () => {
    const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/custom.jpg' }])
    const file = new File(['thumb'], 'custom.jpg', { type: 'image/jpeg' })

    await customThumbnailUploadIntent({ editor, nodeKey, upload, files: [file] })

    expect(getImageDimensions).toHaveBeenCalledExactlyOnceWith('https://example.com/custom.jpg')
    const node = readNode()
    expect(node.customThumbnailSrc).toBe('https://example.com/custom.jpg')
    expect(node.thumbnailWidth).toBe(100)
    expect(node.thumbnailHeight).toBe(50)
  })
})

describe('videoFlowUploadIntent', () => {
  let editor: LexicalEditor
  let nodeKey: string

  beforeEach(async () => {
    editor = createHeadlessEditor({
      nodes: [VideoNode],
      onError: (error) => {
        throw error
      },
    })
    nodeKey = ''
    await updateEditor(editor, () => {
      const node = $createVideoNode({ src: '' })
      $getRoot().append(node)
      nodeKey = node.getKey()
    })
  })

  function readNode(): Record<string, unknown> {
    let snapshot: Record<string, unknown> = {}
    editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey) as VideoNodeType | null
      if (!node) {
        throw new Error('video node missing')
      }
      snapshot = {
        src: node.src,
        duration: node.duration,
        fileName: node.fileName,
        mimeType: node.mimeType,
        thumbnailSrc: node.thumbnailSrc,
        thumbnailWidth: node.thumbnailWidth,
        thumbnailHeight: node.thumbnailHeight,
        customThumbnailSrc: node.customThumbnailSrc,
      }
    })
    return snapshot
  }

  it('runs the thumbnail sub-flow with a synthesized file only when the main flow produced a url and a blob exists', async () => {
    const videoUpload = vi.fn().mockResolvedValue([{ url: 'https://example.com/video.mp4' }])
    const thumbnailUpload = vi.fn().mockResolvedValue([{ url: 'https://example.com/thumb.jpg' }])
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })

    const url = await videoFlowUploadIntent({
      editor,
      nodeKey,
      videoUpload,
      thumbnailUpload,
      files: [file],
      meta: META_WITH_BLOB,
      onEmptyPreview: () => {},
    })

    expect(url).toBe('https://example.com/video.mp4')
    // the synthesized `${file.name}.jpg` rides the thumbnail uploader with the video url as formData
    const [thumbFiles, thumbOptions] = thumbnailUpload.mock.calls[0]
    expect(thumbFiles[0].name).toBe('clip.mp4.jpg')
    expect(thumbFiles[0].type).toBe('image/jpeg')
    expect(thumbOptions).toEqual({ formData: { url: 'https://example.com/video.mp4' } })
    expect(readNode().thumbnailSrc).toBe('https://example.com/thumb.jpg')
  })

  it('skips the sub-flow when the main result is empty and clears the preview', async () => {
    const videoUpload = vi.fn().mockResolvedValue(undefined)
    const thumbnailUpload = vi.fn()
    const onEmptyPreview = vi.fn()
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })

    const url = await videoFlowUploadIntent({
      editor,
      nodeKey,
      videoUpload,
      thumbnailUpload,
      files: [file],
      meta: META_WITH_BLOB,
      onEmptyPreview,
    })

    expect(url).toBeUndefined()
    expect(onEmptyPreview).toHaveBeenCalledOnce()
    expect(thumbnailUpload).not.toHaveBeenCalled()
    expect(readNode().thumbnailSrc).toBe('')
  })

  it('skips the sub-flow when the metadata carries no thumbnail blob', async () => {
    const videoUpload = vi.fn().mockResolvedValue([{ url: 'https://example.com/video.mp4' }])
    const thumbnailUpload = vi.fn()
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })

    const url = await videoFlowUploadIntent({
      editor,
      nodeKey,
      videoUpload,
      thumbnailUpload,
      files: [file],
      meta: META,
      onEmptyPreview: () => {},
    })

    expect(url).toBe('https://example.com/video.mp4')
    expect(thumbnailUpload).not.toHaveBeenCalled()
  })
})
