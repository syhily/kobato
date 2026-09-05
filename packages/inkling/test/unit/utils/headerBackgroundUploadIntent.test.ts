import { createHeadlessEditor } from '@lexical/headless'
import { $getNodeByKey, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import { $createBaseHeaderNode, BaseHeaderNode } from '@/nodes/base/nodes/header/HeaderNode'
import { headerBackgroundUploadIntent } from '@/nodes/upload-intent'
import { getImageDimensions } from '@/utils/getImageDimensions'

vi.mock('@/utils/getImageDimensions', () => ({
  getImageDimensions: vi.fn(),
}))

describe('headerBackgroundUploadIntent', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createHeadlessEditor({ nodes: [BaseHeaderNode], onError: () => {} })
    vi.mocked(getImageDimensions).mockResolvedValue({ width: 100, height: 200 })
  })

  async function createHeaderNodeInEditor(): Promise<string> {
    let nodeKey = ''
    await updateEditor(editor, () => {
      const headerNode = $createBaseHeaderNode({
        backgroundImageSrc: 'https://example.com/old.png',
        backgroundImageWidth: 10,
        backgroundImageHeight: 20,
      })
      $getRoot().append(headerNode)
      nodeKey = headerNode.getKey()
    })
    return nodeKey
  }

  function readBackgroundImage(nodeKey: string): { src: string; width: number | null; height: number | null } {
    return editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey)
      if (!(node instanceof BaseHeaderNode)) {
        throw new Error('header node missing')
      }
      return {
        src: node.backgroundImageSrc,
        width: node.backgroundImageWidth,
        height: node.backgroundImageHeight,
      }
    })
  }

  it('resets the src up front, then patches the result url with dimensions read from the result url', async () => {
    const file = new File(['image'], 'test.png', { type: 'image/png' })
    const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/new.png' }])
    const nodeKey = await createHeaderNodeInEditor()

    const srcDuringUpload = new Promise<string>((resolve) => {
      upload.mockImplementationOnce(async () => {
        resolve(readBackgroundImage(nodeKey).src)
        return [{ url: 'https://example.com/new.png' }]
      })
    })

    const resultUrl = await headerBackgroundUploadIntent({ files: [file], nodeKey, editor, upload })
    await tick()

    expect(resultUrl).toBe('https://example.com/new.png')
    expect(upload).toHaveBeenCalledExactlyOnceWith([file])
    expect(getImageDimensions).toHaveBeenCalledExactlyOnceWith('https://example.com/new.png')
    expect(await srcDuringUpload).toBe('')

    expect(readBackgroundImage(nodeKey)).toEqual({ src: 'https://example.com/new.png', width: 100, height: 200 })
  })

  it.each([
    ['an undefined result', undefined],
    ['a result without a first url', [{}]],
  ])("still patches src '', 0, 0 on %s", async (_label, uploadResult) => {
    const file = new File(['image'], 'test.png', { type: 'image/png' })
    const upload = vi.fn().mockResolvedValue(uploadResult)
    const nodeKey = await createHeaderNodeInEditor()

    const resultUrl = await headerBackgroundUploadIntent({ files: [file], nodeKey, editor, upload })
    await tick()

    expect(resultUrl).toBeUndefined()
    expect(getImageDimensions).not.toHaveBeenCalled()

    expect(readBackgroundImage(nodeKey)).toEqual({ src: '', width: 0, height: 0 })
  })

  it('propagates an upload rejection', async () => {
    const file = new File(['image'], 'test.png', { type: 'image/png' })
    const upload = vi.fn().mockRejectedValue(new Error('upload failed'))
    const nodeKey = await createHeaderNodeInEditor()

    await expect(headerBackgroundUploadIntent({ files: [file], nodeKey, editor, upload })).rejects.toThrow(
      'upload failed',
    )
  })

  it('is a no-op for null files', async () => {
    const upload = vi.fn()
    const nodeKey = await createHeaderNodeInEditor()

    const resultUrl = await headerBackgroundUploadIntent({ files: null, nodeKey, editor, upload })

    expect(resultUrl).toBeUndefined()
    expect(upload).not.toHaveBeenCalled()
    expect(readBackgroundImage(nodeKey).src).toBe('https://example.com/old.png')
  })
})
