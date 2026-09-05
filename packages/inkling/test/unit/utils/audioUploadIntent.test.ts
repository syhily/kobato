import { createHeadlessEditor } from '@lexical/headless'
import { $getNodeByKey, $getRoot, type LexicalEditor } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import { AudioNode, $createAudioNode, type AudioNode as AudioNodeType } from '@/nodes/AudioNode'
import { audioUploadIntent } from '@/nodes/upload-intent'
import { getAudioMetadata } from '@/utils/getAudioMetadata'

vi.mock('@/utils/getAudioMetadata', () => ({
  getAudioMetadata: vi.fn(),
}))

describe('audioUploadIntent', () => {
  let editor: LexicalEditor
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: [AudioNode], onError: () => {} })
    vi.mocked(getAudioMetadata).mockResolvedValue({ duration: 123.456 })
    createObjectURLSpy = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob://audio-preview')
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function createAudioNodeInEditor(): Promise<string> {
    let nodeKey = ''
    await updateEditor(editor, () => {
      const audioNode = $createAudioNode({ src: '' })
      $getRoot().append(audioNode)
      nodeKey = audioNode.getKey()
    })
    return nodeKey
  }

  it('creates an object URL for metadata and revokes it after upload succeeds', async () => {
    const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })
    const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/audio.mp3' }])
    const nodeKey = await createAudioNodeInEditor()

    await audioUploadIntent({ files: [file], nodeKey, editor, upload })
    await tick()

    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(file)
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob://audio-preview')

    editor.getEditorState().read(() => {
      const audioNode = $getNodeByKey(nodeKey) as AudioNodeType | null
      expect(audioNode).not.toBeNull()
      expect(audioNode!.src).toBe('https://example.com/audio.mp3')
      expect(audioNode!.duration).toBe(123.456)
      expect(audioNode!.mimeType).toBe('audio/mpeg')
      expect(audioNode!.title).toBe('Test')
    })
  })

  it('revokes the object URL if the upload rejects', async () => {
    const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })
    const upload = vi.fn().mockRejectedValue(new Error('upload failed'))
    const nodeKey = await createAudioNodeInEditor()

    await expect(audioUploadIntent({ files: [file], nodeKey, editor, upload })).rejects.toThrow('upload failed')

    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(file)
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob://audio-preview')
  })

  it('revokes the object URL when the upload returns no source URL', async () => {
    const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })
    const upload = vi.fn().mockResolvedValue([{}])
    const nodeKey = await createAudioNodeInEditor()

    await audioUploadIntent({ files: [file], nodeKey, editor, upload })

    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(file)
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob://audio-preview')
  })
})
