import type { EmojiData } from 'emoji-picker-react/data'

import {
  ensureEmojiSearchReady,
  registerEmojiExactMatchCompletion,
  searchEmojis,
  type EmojiCommitResult,
} from '@kobato/inkling-internal/plugins/behaviour/emoji-completion'
import { searchEmojiDataset } from '@kobato/inkling-internal/plugins/behaviour/emoji-search-index'
import { createTestEditor, drainEnqueuedUpdates, tick } from '@kobato/inkling/tests/utils/test-editor'
import { $createParagraphNode, $createTextNode, $getRoot, KEY_DOWN_COMMAND, type LexicalEditor } from 'lexical'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const emojiDatasets = vi.hoisted(() => {
  const en: EmojiData = {
    categories: {},
    emojis: {
      smileys: [
        { n: ['grin', 'smile', 'grinning face'], u: '1f600', a: '1' },
        { n: ['grin'], u: '1f601', a: '0.6' },
        { n: ['taco', 'mexican'], u: '1f32e', a: '1' },
      ],
    },
  }
  const zh: EmojiData = {
    categories: {},
    emojis: {
      smileys: [
        { n: ['微笑', 'grin'], u: '1f600', a: '0.6' },
        { n: ['庆祝'], u: '1f389', a: '1' },
      ],
    },
  }
  const zhHant: EmojiData = {
    categories: {},
    emojis: {
      smileys: [{ n: ['微笑'], u: '1f600', a: '0.6' }],
    },
  }
  return { en, zh, 'zh-hant': zhHant }
})

vi.mock('emoji-picker-react/data/emojis-en', () => ({ default: emojiDatasets.en }))
vi.mock('emoji-picker-react/data/emojis-zh', () => ({ default: emojiDatasets.zh }))
vi.mock('emoji-picker-react/data/emojis-zh-hant', () => ({ default: emojiDatasets['zh-hant'] }))

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

describe('emoji dataset search seam', () => {
  beforeAll(async () => {
    await ensureEmojiSearchReady()
  })

  it('merges locale results before en results and dedupes by unified with locale names winning', async () => {
    const results = await searchEmojiDataset('grin', 'zh')

    expect(results.map((emoji) => emoji.unified)).toEqual(['1f600', '1f601'])
    expect(results[0]?.names).toEqual(['微笑', 'grin'])
    expect(results[1]?.names).toEqual(['grin'])
  })

  it('searches only the en dataset for the en locale', async () => {
    const results = await searchEmojiDataset('grin', 'en')

    expect(results.map((emoji) => emoji.unified)).toEqual(['1f600', '1f601'])
    expect(results[0]?.names).toEqual(['grin', 'smile', 'grinning face'])
  })

  it('resolves emoticon aliases to their english search terms', async () => {
    const smile = await searchEmojis(')')
    const dashSmile = await searchEmojis('-)')

    expect(smile[0]?.unified).toBe('1f600')
    expect(smile[0]?.emoji).toBe('😀')
    expect(dashSmile.map((emoji) => emoji.unified)).toEqual(smile.map((emoji) => emoji.unified))
  })

  it('completes an exact name match and prevents the closing colon', async () => {
    const editor = createTestEditor({ headless: false })
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => 'taco', onCommit })
    await setParagraph(editor, ':taco')

    const event = await dispatchColon(editor)

    expect(editor.read(() => $getRoot().getTextContent())).toBe('🌮')
    expect(onCommit).toHaveBeenCalledWith({ unified: '1f32e', emoji: '🌮' })
    expect(event.defaultPrevented).toBe(true)

    cleanup()
  })

  it('matches the typed query case-insensitively', async () => {
    const editor = createTestEditor({ headless: false })
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => 'TACO', onCommit })
    await setParagraph(editor, ':TACO')

    const event = await dispatchColon(editor)

    expect(editor.read(() => $getRoot().getTextContent())).toBe('🌮')
    expect(onCommit).toHaveBeenCalledWith({ unified: '1f32e', emoji: '🌮' })
    expect(event.defaultPrevented).toBe(true)

    cleanup()
  })

  it('completes a localized exact match when a locale is registered', async () => {
    const editor = createTestEditor({ headless: false })
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => '微笑', locale: 'zh', onCommit })
    await setParagraph(editor, ':微笑')

    const event = await dispatchColon(editor)

    expect(editor.read(() => $getRoot().getTextContent())).toBe('😀')
    expect(onCommit).toHaveBeenCalledWith({ unified: '1f600', emoji: '😀' })
    expect(event.defaultPrevented).toBe(true)

    cleanup()
  })

  it('does not complete when the first hit has no name equal to the query', async () => {
    const editor = createTestEditor({ headless: false })
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => 'smi', onCommit })
    await setParagraph(editor, ':smi')

    const event = await dispatchColon(editor)

    expect(editor.read(() => $getRoot().getTextContent())).toBe(':smi')
    expect(onCommit).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)

    cleanup()
  })
})
