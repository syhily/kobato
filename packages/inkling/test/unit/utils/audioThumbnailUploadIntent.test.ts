import { createHeadlessEditor } from '@lexical/headless'
import { $getNodeByKey, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { AudioNode, $createAudioNode, type AudioNode as AudioNodeType } from '@/nodes/AudioNode'
import { audioThumbnailUploadIntent } from '@/nodes/upload-intent'

describe('audioThumbnailUploadIntent', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: [AudioNode], onError: () => {} })
  })

  async function createAudioNodeInEditor(): Promise<string> {
    let nodeKey = ''
    await updateEditor(editor, () => {
      const audioNode = $createAudioNode({ src: '/audio.mp3' })
      $getRoot().append(audioNode)
      nodeKey = audioNode.getKey()
    })
    return nodeKey
  }

  function readThumbnailSrc(nodeKey: string): string {
    return editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey) as AudioNodeType | null
      return node?.thumbnailSrc ?? ''
    })
  }

  it('does nothing when files is null', async () => {
    const upload = vi.fn()
    const nodeKey = await createAudioNodeInEditor()

    await audioThumbnailUploadIntent({ files: null, nodeKey, editor, upload })

    expect(upload).not.toHaveBeenCalled()
  })

  it('passes the current node src as form data and writes the returned thumbnail url', async () => {
    const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/thumb.jpg' }])
    const nodeKey = await createAudioNodeInEditor()
    const file = new File(['image'], 'thumb.jpg', { type: 'image/jpeg' })

    await audioThumbnailUploadIntent({ files: [file], nodeKey, editor, upload })

    expect(upload).toHaveBeenCalledExactlyOnceWith([file], { formData: { url: '/audio.mp3' } })
    expect(readThumbnailSrc(nodeKey)).toBe('https://example.com/thumb.jpg')
  })

  it('leaves the node untouched when no thumbnail url comes back', async () => {
    const upload = vi.fn().mockResolvedValue([{}])
    const nodeKey = await createAudioNodeInEditor()
    const file = new File(['image'], 'thumb.jpg', { type: 'image/jpeg' })

    await audioThumbnailUploadIntent({ files: [file], nodeKey, editor, upload })

    expect(upload).toHaveBeenCalledExactlyOnceWith([file], { formData: { url: '/audio.mp3' } })
    expect(readThumbnailSrc(nodeKey)).toBe('')
  })
})
