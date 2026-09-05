import { createHeadlessEditor } from '@lexical/headless'
import { type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { getCardMenu } from '#/utils/card-menu'
import { updateEditor } from '#/utils/test-editor'
import { AudioNode, $createAudioNode, $isAudioNode, INSERT_AUDIO_COMMAND } from '@/nodes/AudioNode'
import { getCardDragIcon } from '@/nodes/cards/card-menus'

const editorNodes = [AudioNode]

describe('AudioNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isAudioNode', async () => {
    await updateEditor(editor, () => {
      const node = $createAudioNode({})
      expect($isAudioNode(node)).toBe(true)
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('audio')?.[0]?.label).toBe('Audio')
    expect(getCardMenu('audio')?.[0]?.insertCommand).toBe(INSERT_AUDIO_COMMAND)
  })

  it('resolves the audio drag icon from the card menu', () => {
    expect(typeof getCardDragIcon('audio')).toBe('function')
  })

  it('sets __triggerFileDialog when no src is provided', async () => {
    await updateEditor(editor, () => {
      const node = $createAudioNode({ triggerFileDialog: true })
      expect(node.__triggerFileDialog).toBe(true)
    })
  })

  it('does not trigger the file dialog when a src is present', async () => {
    await updateEditor(editor, () => {
      const node = $createAudioNode({ src: 'https://example.com/audio.mp3', triggerFileDialog: true })
      expect(node.__triggerFileDialog).toBe(false)
    })
  })

  it('supports setting triggerFileDialog via setter', async () => {
    await updateEditor(editor, () => {
      const node = $createAudioNode({})
      node.triggerFileDialog = true
      expect(node.__triggerFileDialog).toBe(true)
    })
  })
})
