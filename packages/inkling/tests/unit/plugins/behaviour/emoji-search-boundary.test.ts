import {
  ensureEmojiSearchReady,
  registerEmojiExactMatchCompletion,
  searchEmojis,
  type EmojiCommitResult,
} from '@kobato/inkling-internal/plugins/behaviour/emoji-completion'
import { createTestEditor, drainEnqueuedUpdates, tick } from '@kobato/inkling/tests/utils/test-editor'
import { $createParagraphNode, $createTextNode, $getRoot, KEY_DOWN_COMMAND, type LexicalEditor } from 'lexical'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const searchEmojiMartIndex = vi.hoisted(() => vi.fn<(query: string) => Promise<unknown>>())

const ink_plugins_behaviour_emoji_search_index =
  await import('@kobato/inkling-internal/plugins/behaviour/emoji-search-index')
vi.spyOn(ink_plugins_behaviour_emoji_search_index, 'searchEmojiMartIndex').mockImplementation(((query: string) =>
  searchEmojiMartIndex(query)) as never)

afterAll(() => {
  vi.restoreAllMocks()
})

async function setParagraph(editor: LexicalEditor, text: string) {
  await drainEnqueuedUpdates(editor, () => {
    const root = $getRoot()
    root.clear()
    const paragraph = $createParagraphNode()
    const node = $createTextNode(text)
    paragraph.append(node)
    root.append(paragraph)
    node.select(text.length, text.length)
  })
}

async function dispatchColon(editor: LexicalEditor): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key: ':', cancelable: true })
  editor.dispatchCommand(KEY_DOWN_COMMAND, event)
  await tick()
  return event
}

describe('emoji search-result boundary', () => {
  beforeAll(async () => {
    await ensureEmojiSearchReady()
  })

  beforeEach(() => {
    searchEmojiMartIndex.mockReset()
  })

  it('drops empty-skins, null, and malformed entries while keeping valid ones', async () => {
    searchEmojiMartIndex.mockResolvedValue([
      null,
      'taco',
      { id: 'no-skins' },
      { id: 'empty-skins', skins: [] },
      { id: 'bad-native', skins: [{ native: 42 }] },
      { id: 'null-skin', skins: [null] },
      { id: 'taco', skins: [{ native: '🌮' }] },
    ])

    const results = await searchEmojis('taco')

    expect(results).toEqual([{ id: 'taco', skins: [{ native: '🌮' }] }])
  })

  it('treats a non-array adapter result as no results', async () => {
    searchEmojiMartIndex.mockResolvedValue({ id: 'taco', skins: [{ native: '🌮' }] })

    await expect(searchEmojis('taco')).resolves.toEqual([])
  })

  it('does not hand an empty-skins entry to an insertion (exact-match completion)', async () => {
    searchEmojiMartIndex.mockResolvedValue([{ id: 'taco', skins: [] }])
    const editor = createTestEditor({ headless: false })
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => 'taco', onCommit })
    await setParagraph(editor, ':taco')

    const event = await dispatchColon(editor)

    expect(editor.read(() => $getRoot().getTextContent())).toBe(':taco')
    expect(onCommit).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)

    cleanup()
  })

  it('still completes a valid id match through the scripted adapter', async () => {
    searchEmojiMartIndex.mockResolvedValue([{ id: 'smile', skins: [{ native: '😄' }] }])
    const editor = createTestEditor({ headless: false })
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => 'smile', onCommit })
    await setParagraph(editor, ':smile')

    const event = await dispatchColon(editor)

    expect(editor.read(() => $getRoot().getTextContent())).toBe('😄')
    expect(onCommit).toHaveBeenCalledWith({ id: 'smile', native: '😄' })
    expect(event.defaultPrevented).toBe(true)

    cleanup()
  })
})
