import { createHeadlessEditor } from '@lexical/headless'
import { $getNodeByKey, $getRoot, type LexicalEditor } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import { ImageNode, $createImageNode, type ImageNode as ImageNodeType } from '@/nodes/ImageNode'
import { imageUploadIntent } from '@/nodes/upload-intent'
import { getImageDimensions } from '@/utils/getImageDimensions'

vi.mock('@/utils/getImageDimensions', () => ({
  getImageDimensions: vi.fn(),
}))

describe('imageUploadIntent', () => {
  let editor: LexicalEditor
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: [ImageNode], onError: () => {} })
    vi.mocked(getImageDimensions).mockResolvedValue({ width: 100, height: 200 })
    createObjectURLSpy = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob://image-preview')
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function createImageNodeInEditor(): Promise<string> {
    let nodeKey = ''
    await updateEditor(editor, () => {
      const imageNode = $createImageNode({ src: '' })
      $getRoot().append(imageNode)
      nodeKey = imageNode.getKey()
    })
    return nodeKey
  }

  it('creates an object URL for preview and revokes it after upload succeeds', async () => {
    const file = new File(['image'], 'test.png', { type: 'image/png' })
    const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/image.png' }])
    const nodeKey = await createImageNodeInEditor()

    await imageUploadIntent({ files: [file], nodeKey, editor, upload })
    await tick()

    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(file)
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob://image-preview')

    editor.getEditorState().read(() => {
      const imageNode = $getNodeByKey(nodeKey) as ImageNodeType | null
      expect(imageNode).not.toBeNull()
      expect(imageNode!.src).toBe('https://example.com/image.png')
      expect(imageNode!.previewSrc).toBeNull()
      expect(imageNode!.width).toBe(100)
      expect(imageNode!.height).toBe(200)
    })
  })

  it('revokes the object URL if the upload rejects', async () => {
    const file = new File(['image'], 'test.png', { type: 'image/png' })
    const upload = vi.fn().mockRejectedValue(new Error('upload failed'))
    const nodeKey = await createImageNodeInEditor()

    await expect(imageUploadIntent({ files: [file], nodeKey, editor, upload })).rejects.toThrow('upload failed')

    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(file)
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob://image-preview')
  })

  it('revokes the object URL if metadata extraction fails', async () => {
    vi.mocked(getImageDimensions).mockRejectedValue(new Error('failed to read dimensions'))
    const file = new File(['image'], 'test.png', { type: 'image/png' })
    const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/image.png' }])
    const nodeKey = await createImageNodeInEditor()

    await expect(imageUploadIntent({ files: [file], nodeKey, editor, upload })).rejects.toThrow(
      'failed to read dimensions',
    )

    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(file)
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob://image-preview')
  })
})
