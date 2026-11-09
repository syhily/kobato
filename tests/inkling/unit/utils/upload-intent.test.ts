import { createHeadlessEditor } from '@lexical/headless'
import { $getNodeByKey, $getRoot, type LexicalEditor, type LexicalNode } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/inkling/utils/test-editor'
import { AudioNode, $createAudioNode } from '@/inkling/nodes/AudioNode'
import {
  $isAudioNode,
  $isFileNode,
  $isImageNode,
  type BaseAudioNode as AudioNodeType,
  type BaseFileNode as FileNodeType,
  type BaseImageNode as ImageNodeType,
} from '@/inkling/nodes/base'
import { FileNode, $createFileNode } from '@/inkling/nodes/FileNode'
import { ImageNode, $createImageNode } from '@/inkling/nodes/ImageNode'
import {
  runUploadIntent,
  type ExtractMetadataContext,
  type RunUploadIntentOptions,
} from '@/inkling/nodes/upload-intent'

describe('runUploadIntent', () => {
  let editor: LexicalEditor
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: [ImageNode, AudioNode, FileNode], onError: () => {} })
    createObjectURLSpy = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:preview')
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function createNodeInEditor(create: () => LexicalNode): Promise<string> {
    let nodeKey = ''
    await updateEditor(editor, () => {
      const node = create()
      $getRoot().append(node)
      nodeKey = node.getKey()
    })
    return nodeKey
  }

  it('does nothing when files is null — no upload, no prePatch, no lease', async () => {
    const upload = vi.fn()
    const prePatch = vi.fn()
    const nodeKey = await createNodeInEditor(() => $createImageNode({ src: '/image.png' }))

    const result = await runUploadIntent({
      editor,
      nodeKey,
      guard: $isImageNode,
      files: null,
      upload,
      prePatch,
      preview: {},
      emptyResult: { kind: 'patch' },
      patch: vi.fn(),
    })

    expect(result).toBeUndefined()
    expect(upload).not.toHaveBeenCalled()
    expect(prePatch).not.toHaveBeenCalled()
    expect(createObjectURLSpy).not.toHaveBeenCalled()
  })

  it('does nothing when files is empty — no upload, no prePatch, no lease', async () => {
    const upload = vi.fn()
    const prePatch = vi.fn()
    const nodeKey = await createNodeInEditor(() => $createImageNode({ src: '/image.png' }))

    const result = await runUploadIntent({
      editor,
      nodeKey,
      guard: $isImageNode,
      files: [],
      upload,
      prePatch,
      preview: {},
      emptyResult: { kind: 'patch' },
      patch: vi.fn(),
    })

    expect(result).toBeUndefined()
    expect(upload).not.toHaveBeenCalled()
    expect(prePatch).not.toHaveBeenCalled()
    expect(createObjectURLSpy).not.toHaveBeenCalled()
  })

  describe('image matrix: preview lease, before-upload extraction, patch-always', () => {
    type ImageMeta = { width: number; height: number }
    type ImageIntent = Omit<RunUploadIntentOptions<ImageNodeType, ImageMeta>, 'nodeKey' | 'files' | 'upload'>

    function imageIntent(overrides: Partial<ImageIntent> = {}): ImageIntent {
      return {
        editor,
        guard: $isImageNode,
        preview: {
          publish: (node, url) => {
            node.previewSrc = url
          },
        },
        metadata: {
          kind: 'extract',
          timing: 'beforeUpload',
          extract: async ({ previewUrl }) => ({
            width: previewUrl ? 100 : 0,
            height: 200,
          }),
        },
        emptyResult: { kind: 'patch' },
        patch: (node, { meta, resultUrl }) => {
          if (!meta) {
            throw new Error('Expected extracted image metadata')
          }
          node.width = meta.width
          node.height = meta.height
          node.src = resultUrl ?? ''
          node.previewSrc = null
        },
        ...overrides,
      }
    }

    function readImage(nodeKey: string) {
      return editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey) as ImageNodeType | null
        return node ? { src: node.src, previewSrc: node.previewSrc, width: node.width, height: node.height } : null
      })
    }

    it('publishes the preview before uploading, then releases the lease after the upload settles', async () => {
      const nodeKey = await createNodeInEditor(() => $createImageNode({ src: '' }))
      const file = new File(['image'], 'test.png', { type: 'image/png' })
      const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/image.png' }])
      const publish = vi.fn((node: ImageNodeType, url: string) => {
        node.previewSrc = url
      })

      const result = await runUploadIntent({
        ...imageIntent({ preview: { publish } }),
        nodeKey,
        files: [file],
        upload,
      })

      expect(result).toBe('https://example.com/image.png')
      expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(file)
      expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:preview')
      // ordered invocation, not just final state: lease → publish → upload → release
      expect(createObjectURLSpy.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0])
      expect(publish.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0])
      expect(upload.mock.invocationCallOrder[0]).toBeLessThan(revokeObjectURLSpy.mock.invocationCallOrder[0])
      expect(readImage(nodeKey)).toEqual({
        src: 'https://example.com/image.png',
        previewSrc: null,
        width: 100,
        height: 200,
      })
    })

    it('still patches with an empty src when the upload result has no url', async () => {
      const nodeKey = await createNodeInEditor(() => $createImageNode({ src: '/old.png' }))
      const upload = vi.fn().mockResolvedValue([{}])

      await runUploadIntent({ ...imageIntent(), nodeKey, files: [new File(['x'], 't.png')], upload })

      expect(readImage(nodeKey)).toEqual({ src: '', previewSrc: null, width: 100, height: 200 })
    })

    it('propagates upload rejections and releases the lease', async () => {
      const nodeKey = await createNodeInEditor(() => $createImageNode({ src: '' }))
      const upload = vi.fn().mockRejectedValue(new Error('upload failed'))

      await expect(
        runUploadIntent({ ...imageIntent(), nodeKey, files: [new File(['x'], 't.png')], upload }),
      ).rejects.toThrow('upload failed')

      expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:preview')
      // released only after the upload settled (rejected), not before it started
      expect(upload.mock.invocationCallOrder[0]).toBeLessThan(revokeObjectURLSpy.mock.invocationCallOrder[0])
      // the preview patch was applied before the rejection and stays
      expect(readImage(nodeKey)?.previewSrc).toBe('blob:preview')
    })

    it('propagates extraction failures without calling upload, and releases the lease', async () => {
      const nodeKey = await createNodeInEditor(() => $createImageNode({ src: '' }))
      const upload = vi.fn()

      await expect(
        runUploadIntent({
          ...imageIntent({
            metadata: {
              kind: 'extract',
              timing: 'beforeUpload',
              extract: async () => {
                throw new Error('failed to read dimensions')
              },
            },
          }),
          nodeKey,
          files: [new File(['x'], 't.png')],
          upload,
        }),
      ).rejects.toThrow('failed to read dimensions')

      expect(upload).not.toHaveBeenCalled()
      expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:preview')
    })
  })

  describe('audio matrix: metadata-only lease, after-upload extraction, bail', () => {
    type AudioMeta = { duration: number }
    type AudioIntent = Omit<RunUploadIntentOptions<AudioNodeType, AudioMeta>, 'nodeKey' | 'files' | 'upload'>

    function audioIntent(extract: (context: ExtractMetadataContext) => Promise<AudioMeta>): AudioIntent {
      return {
        editor,
        guard: $isAudioNode,
        preview: {},
        metadata: { kind: 'extract', timing: 'afterUpload', extract },
        emptyResult: { kind: 'bail' },
        patch: (node, { meta, resultUrl }) => {
          if (!meta) {
            throw new Error('Expected extracted audio metadata')
          }
          node.duration = meta.duration
          node.src = resultUrl ?? ''
        },
      }
    }

    function readAudio(nodeKey: string) {
      return editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey) as AudioNodeType | null
        return node ? { src: node.src, duration: node.duration } : null
      })
    }

    it('uploads first, then extracts and patches; the lease is released', async () => {
      const nodeKey = await createNodeInEditor(() => $createAudioNode({ src: '' }))
      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })
      const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/audio.mp3' }])
      const extract = vi.fn().mockResolvedValue({ duration: 42 })

      const result = await runUploadIntent({ ...audioIntent(extract), nodeKey, files: [file], upload })

      expect(result).toBe('https://example.com/audio.mp3')
      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file,
        previewUrl: 'blob:preview',
        resultUrl: 'https://example.com/audio.mp3',
      })
      expect(readAudio(nodeKey)).toEqual({ src: 'https://example.com/audio.mp3', duration: 42 })
      expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:preview')
    })

    it('bails with the node untouched and skips extraction when the result has no url', async () => {
      const nodeKey = await createNodeInEditor(() => $createAudioNode({ src: '/old.mp3' }))
      const upload = vi.fn().mockResolvedValue([{}])
      const extract = vi.fn().mockResolvedValue({ duration: 42 })

      const result = await runUploadIntent({
        ...audioIntent(extract),
        nodeKey,
        files: [new File(['x'], 't.mp3')],
        upload,
      })

      expect(result).toBeUndefined()
      expect(extract).not.toHaveBeenCalled()
      expect(readAudio(nodeKey)).toEqual({ src: '/old.mp3', duration: 0 })
      expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:preview')
    })
  })

  describe('file matrix: no lease, prePatch src reset, custom empty predicate', () => {
    type FileIntent = Omit<RunUploadIntentOptions<FileNodeType>, 'nodeKey' | 'files' | 'upload'>

    function fileIntent(): FileIntent {
      return {
        editor,
        guard: $isFileNode,
        prePatch: (node) => {
          node.src = ''
        },
        emptyResult: {
          kind: 'bail',
          isEmptyResult: (result) => !result?.[0],
        },
        patch: (node, { resultUrl }) => {
          node.src = resultUrl ?? ''
        },
      }
    }

    function readFileSrc(nodeKey: string) {
      return editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey) as FileNodeType | null
        return node?.src
      })
    }

    it('applies the prePatch through the seam before uploading', async () => {
      const nodeKey = await createNodeInEditor(() => $createFileNode({ src: '/existing.pdf' }))
      const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/report.pdf' }])

      await runUploadIntent({ ...fileIntent(), nodeKey, files: [new File(['x'], 'report.pdf')], upload })

      expect(readFileSrc(nodeKey)).toBe('https://example.com/report.pdf')
      expect(createObjectURLSpy).not.toHaveBeenCalled()
    })

    it('bails when the result array is empty, keeping the prePatch reset', async () => {
      const nodeKey = await createNodeInEditor(() => $createFileNode({ src: '/existing.pdf' }))
      const upload = vi.fn().mockResolvedValue([])

      const result = await runUploadIntent({ ...fileIntent(), nodeKey, files: [new File(['x'], 'report.pdf')], upload })

      expect(result).toBeUndefined()
      expect(readFileSrc(nodeKey)).toBe('')
    })

    it('patches an empty src when the result item exists but has no url', async () => {
      const nodeKey = await createNodeInEditor(() => $createFileNode({ src: '/existing.pdf' }))
      const upload = vi.fn().mockResolvedValue([{}])

      await runUploadIntent({ ...fileIntent(), nodeKey, files: [new File(['x'], 'report.pdf')], upload })

      expect(readFileSrc(nodeKey)).toBe('')
    })
  })

  describe('thumbnail matrix: upload options resolved off the node', () => {
    it('resolves formData from the current node src and patches the returned url', async () => {
      const nodeKey = await createNodeInEditor(() => $createAudioNode({ src: '/audio.mp3' }))
      const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/thumb.jpg' }])
      const file = new File(['image'], 'thumb.jpg', { type: 'image/jpeg' })

      await runUploadIntent({
        editor,
        nodeKey,
        guard: $isAudioNode,
        files: [file],
        upload,
        uploadOptions: (node) => ({ formData: { url: node?.src ?? '' } }),
        emptyResult: { kind: 'bail' },
        patch: (node, { resultUrl }) => {
          node.thumbnailSrc = resultUrl ?? ''
        },
      })

      expect(upload).toHaveBeenCalledExactlyOnceWith([file], { formData: { url: '/audio.mp3' } })
      const thumbnailSrc = editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey) as AudioNodeType | null
        return node?.thumbnailSrc
      })
      expect(thumbnailSrc).toBe('https://example.com/thumb.jpg')
    })
  })

  describe('empty-result bail hook and pre-extracted meta', () => {
    it('calls onBail and returns undefined on an empty result', async () => {
      const nodeKey = await createNodeInEditor(() => $createImageNode({ src: '' }))
      const upload = vi.fn().mockResolvedValue(undefined)
      const onBail = vi.fn()

      const result = await runUploadIntent({
        editor,
        nodeKey,
        guard: $isImageNode,
        files: [new File(['x'], 't.png')],
        upload,
        metadata: { kind: 'preExtracted', meta: { duration: 7 } },
        emptyResult: { kind: 'bail', onBail },
        patch: vi.fn(),
      })

      expect(result).toBeUndefined()
      expect(onBail).toHaveBeenCalledTimes(1)
    })

    it('passes pre-extracted meta through to the patch', async () => {
      const nodeKey = await createNodeInEditor(() => $createImageNode({ src: '' }))
      const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/v.mp4' }])
      const patch = vi.fn()

      await runUploadIntent({
        editor,
        nodeKey,
        guard: $isImageNode,
        files: [new File(['x'], 't.png')],
        upload,
        metadata: { kind: 'preExtracted', meta: { duration: 7 } },
        emptyResult: { kind: 'bail' },
        patch,
      })

      expect(patch).toHaveBeenCalledTimes(1)
      expect(patch.mock.calls[0][1]).toMatchObject({ meta: { duration: 7 }, resultUrl: 'https://example.com/v.mp4' })
    })
  })
})
