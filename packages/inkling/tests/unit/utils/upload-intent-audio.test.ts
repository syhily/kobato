import { AudioNode, $createAudioNode, type AudioNode as AudioNodeType } from '@kobato/inkling-internal/nodes/AudioNode'
import { audioUploadIntent } from '@kobato/inkling-internal/nodes/upload-intent'
import { tick, updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import { createHeadlessEditor } from '@lexical/headless'
import { $getNodeByKey, $getRoot, type LexicalEditor } from 'lexical'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ink_utils_get_audio_metadata = await import('@kobato/inkling-internal/utils/get-audio-metadata')
const getAudioMetadataSpy = vi
  .spyOn(ink_utils_get_audio_metadata, 'getAudioMetadata')
  .mockImplementation(vi.fn() as never)
const getAudioMetadata = getAudioMetadataSpy

afterAll(() => {
  vi.restoreAllMocks()
})

describe('audioUploadIntent', () => {
  let editor: LexicalEditor
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: [AudioNode], onError: () => {} })
    getAudioMetadata.mockResolvedValue({ duration: 123.456 })
    createObjectURLSpy = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob://audio-preview')
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    createObjectURLSpy?.mockRestore()
    revokeObjectURLSpy?.mockRestore()
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
