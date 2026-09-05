import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  KEY_DOWN_COMMAND,
  createEditor,
  type LexicalEditor,
  type TextNode,
} from 'lexical'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { drainEnqueuedUpdates, tick } from '#/utils/test-editor'
// Behaviour pins for the headless half of the emoji picker
// (src/plugins/behaviour/emoji-completion.ts): the query policy with the
// emoticon alias table, the exact-match `:shortcode:` completion, and the two
// insertion surgeries. The mounted-plugin wiring lives in
// test/unit/plugins/EmojiPickerPlugin.test.tsx.
//
// Harness notes:
// - The tests run against the REAL emoji-mart SearchIndex (initialized once
//   via ensureEmojiSearchReady) — the index is pure data + string matching
//   and works headless. The once-guard's exact-once property stays pinned by
//   the plugin test, which mocks emoji-mart and counts init calls.
// - No root element is attached: the module never touches the DOM selection,
//   and commands are dispatched straight into the editor. Lexical's own
//   editor-priority KEY_DOWN handler makes dispatchCommand return true
//   regardless of this module's listener, so only the observable effects are
//   pinned (text, commit callback, defaultPrevented).
// - node.select() leaves selection.format at 0; in the browser Lexical syncs
//   the format off the reconciled native selection. buildParagraph copies the
//   caret node's format onto the selection to emulate that.
// - The completion tests pin the keydown-time caret shape (text ':query',
//   caret right after the query). jsdom has no keydown default action, and in
//   real browsers the registration's preventDefault lands inside the
//   keydown's microtask window, so the closing ':' never reaches the text
//   before the splice runs.
import {
  $insertEmojiCompletion,
  $insertSelectedEmoji,
  ensureEmojiSearchReady,
  registerEmojiExactMatchCompletion,
  searchEmojis,
  type EmojiCommitResult,
  type EmojiSearchResult,
} from '@/plugins/behaviour/emoji-completion'

const taco: EmojiSearchResult = { id: 'taco', skins: [{ native: '🌮' }] }

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [],
    onError: () => {},
    theme: {},
  })
}

// Lexical 0.46 commits listener-triggered work on microtasks — a macrotask
// wait (tick) drains the search promise and the completion update.

// Emulates the browser-side format sync Lexical does when reconciling the
// native selection — programmatic node.select() leaves format at 0.
function $syncSelectionFormat(caretNode: TextNode) {
  const selection = $getSelection()
  if ($isRangeSelection(selection)) {
    selection.format = caretNode.getFormat()
  }
}

interface TextSegment {
  text: string
  format?: 'bold' | 'code'
}

// Builds a single paragraph from text segments with a collapsed caret at
// [segment, offset]; returns the created text nodes. Segments that would
// merge (adjacent same-format text) must use buildSplitParagraph instead.
async function buildParagraph(
  editor: LexicalEditor,
  segments: TextSegment[],
  caret: { segment: number; offset: number },
) {
  let nodes: TextNode[] = []
  await drainEnqueuedUpdates(editor, () => {
    const root = $getRoot()
    root.clear()
    const paragraph = $createParagraphNode()
    nodes = segments.map(({ text, format }) => {
      const node = $createTextNode(text)
      if (format) {
        node.setFormat(format)
      }
      paragraph.append(node)
      return node
    })
    root.append(paragraph)
    const caretNode = nodes[caret.segment]
    caretNode.select(caret.offset, caret.offset)
    $syncSelectionFormat(caretNode)
  })
  return nodes
}

function rootText(editor: LexicalEditor): string {
  return editor.read(() => $getRoot().getTextContent())
}

function emojiNodeFormat(editor: LexicalEditor, native: string): string[] {
  return editor.read(() => {
    const paragraph = $getRoot().getFirstChild()
    if (!paragraph || !$isElementNode(paragraph)) {
      return []
    }
    const node = paragraph.getChildren().find((child) => $isTextNode(child) && child.getTextContent().includes(native))
    if (!node || !$isTextNode(node)) {
      return []
    }
    return (['bold', 'italic', 'code', 'highlight'] as const).filter((format) => node.hasFormat(format))
  })
}

function colonKeydown(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: ':', cancelable: true })
}

describe('ensureEmojiSearchReady', () => {
  it('leaves the index usable, called once or twice', async () => {
    ensureEmojiSearchReady()
    ensureEmojiSearchReady()
    const results = await searchEmojis('taco')
    expect(results[0]?.id).toBe('taco')
  })
})

describe('searchEmojis query policy', () => {
  beforeAll(() => {
    ensureEmojiSearchReady()
  })

  it('maps emoticon aliases to their emoji search terms', async () => {
    const smile = await searchEmojis(')')
    const dashSmile = await searchEmojis('-)')
    const frown = await searchEmojis('(')
    const dashFrown = await searchEmojis('-(')

    expect(smile[0]?.id).toBe('smile')
    expect(dashSmile[0]?.id).toBe('smile')
    // searching 'frown' ranks the 'frowning' emoji first
    expect(frown[0]?.id).toBe('frowning')
    expect(dashFrown[0]?.id).toBe('frowning')
  })

  it('passes plain queries through to the index untouched', async () => {
    const results = await searchEmojis('taco')
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('taco')
    expect(results[0]?.skins[0]?.native).toBe('🌮')
  })
})

describe('registerEmojiExactMatchCompletion', () => {
  beforeAll(() => {
    ensureEmojiSearchReady()
  })

  async function dispatchColon(editor: LexicalEditor) {
    const event = colonKeydown()
    editor.dispatchCommand(KEY_DOWN_COMMAND, event)
    await tick()
    return event
  }

  it('completes an exact `:shortcode:` match and prevents the closing colon', async () => {
    const editor = createTestEditor()
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => 'smile', onCommit })
    await buildParagraph(editor, [{ text: ':smile' }], { segment: 0, offset: 6 })

    const event = await dispatchColon(editor)

    expect(rootText(editor)).toBe('😄')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith({ id: 'smile', native: '😄' })
    expect(event.defaultPrevented).toBe(true)

    cleanup()
  })

  it('does not complete when the first hit is not an exact match', async () => {
    const editor = createTestEditor()
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    // 'smi' searches fine (top hit 'smile') but is not itself an emoji id
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => 'smi', onCommit })
    await buildParagraph(editor, [{ text: ':smi' }], { segment: 0, offset: 4 })

    const event = await dispatchColon(editor)

    expect(rootText(editor)).toBe(':smi')
    expect(onCommit).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)

    cleanup()
  })

  it('does not complete when the query has no search results', async () => {
    const editor = createTestEditor()
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => 'zzzqqq', onCommit })
    await buildParagraph(editor, [{ text: ':zzzqqq' }], { segment: 0, offset: 7 })

    const event = await dispatchColon(editor)

    expect(rootText(editor)).toBe(':zzzqqq')
    expect(onCommit).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)

    cleanup()
  })

  it('does not complete inside inline-code-formatted text', async () => {
    const editor = createTestEditor()
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => 'smile', onCommit })
    await buildParagraph(editor, [{ text: ':smile', format: 'code' }], { segment: 0, offset: 6 })

    const event = await dispatchColon(editor)

    expect(rootText(editor)).toBe(':smile')
    expect(onCommit).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)

    cleanup()
  })

  it('does nothing without an active query', async () => {
    const editor = createTestEditor()
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => null, onCommit })
    await buildParagraph(editor, [{ text: ':smile' }], { segment: 0, offset: 6 })

    const event = await dispatchColon(editor)

    expect(rootText(editor)).toBe(':smile')
    expect(onCommit).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)

    cleanup()
  })

  it('stops completing once unregistered', async () => {
    const editor = createTestEditor()
    const onCommit = vi.fn<(result: EmojiCommitResult) => void>()
    const cleanup = registerEmojiExactMatchCompletion(editor, { getQuery: () => 'smile', onCommit })
    await buildParagraph(editor, [{ text: ':smile' }], { segment: 0, offset: 6 })

    cleanup()
    const event = await dispatchColon(editor)

    expect(rootText(editor)).toBe(':smile')
    expect(onCommit).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('$insertEmojiCompletion', () => {
  it('replaces the shortcode ending at the caret and carries its format', async () => {
    const editor = createTestEditor()
    await buildParagraph(editor, [{ text: ':taco', format: 'bold' }], { segment: 0, offset: 5 })

    let committed: EmojiCommitResult | null = null
    await drainEnqueuedUpdates(editor, () => {
      committed = $insertEmojiCompletion(taco)
    })

    expect(committed).toEqual({ id: 'taco', native: '🌮' })
    expect(rootText(editor)).toBe('🌮')
    expect(emojiNodeFormat(editor, '🌮')).toEqual(['bold'])
  })

  it('deletes exactly id.length + 1 characters (the query and its leading colon)', async () => {
    const editor = createTestEditor()
    // a prefix makes the deleted span observable: one character too few
    // would leave the leading ':' behind
    await buildParagraph(editor, [{ text: 'say :taco' }], { segment: 0, offset: 9 })

    await drainEnqueuedUpdates(editor, () => {
      $insertEmojiCompletion(taco)
    })

    expect(rootText(editor)).toBe('say 🌮')
    // the caret ends up right after the inserted emoji
    editor.read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        throw new Error('expected a range selection')
      }
      const anchorText = selection.anchor.getNode().getTextContent()
      expect(anchorText.endsWith('🌮')).toBe(true)
      expect(selection.anchor.offset).toBe(anchorText.length)
    })
  })

  it('returns null without a selection to splice into', () => {
    const editor = createTestEditor()

    let committed: EmojiCommitResult | null = null
    editor.read(() => {
      committed = $insertEmojiCompletion(taco)
    })

    expect(committed).toBeNull()
  })
})

describe('$insertSelectedEmoji', () => {
  it('removes the query node, inserts the emoji, and carries the caret format', async () => {
    const editor = createTestEditor()
    await buildParagraph(editor, [{ text: 'hello :ta', format: 'bold' }], { segment: 0, offset: 9 })

    let committed: EmojiCommitResult | null = null
    await drainEnqueuedUpdates(editor, () => {
      // split the query node out the way the typeahead's
      // selectOptionAndCleanUp does ($splitNodeContainingQuery) — the split
      // and the surgery share one update because same-format text nodes
      // re-merge at commit time
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        throw new Error('expected a range selection')
      }
      const anchorNode = selection.anchor.getNode()
      if (!$isTextNode(anchorNode)) {
        throw new Error('expected a text anchor')
      }
      const queryNode = anchorNode.splitText(6)[1]
      committed = $insertSelectedEmoji(taco, queryNode)
    })

    expect(committed).toEqual({ id: 'taco', native: '🌮' })
    expect(rootText(editor)).toBe('hello 🌮')
    expect(emojiNodeFormat(editor, '🌮')).toEqual(['bold'])
  })

  it('inserts at the caret when there is no query node to remove', async () => {
    const editor = createTestEditor()
    await buildParagraph(editor, [{ text: 'hi ' }], { segment: 0, offset: 3 })

    let committed: EmojiCommitResult | null = null
    await drainEnqueuedUpdates(editor, () => {
      committed = $insertSelectedEmoji(taco, null)
    })

    expect(committed).toEqual({ id: 'taco', native: '🌮' })
    expect(rootText(editor)).toBe('hi 🌮')
    expect(emojiNodeFormat(editor, '🌮')).toEqual([])
  })

  it('consumes a trigger colon the typeahead split left in the previous sibling', async () => {
    // the typeahead re-split the query after the colon — [`:`][`tac`] — and
    // handed the surgery only the `tac` node; without the sibling consumption
    // the commit leaves the stray ':' behind (the e2e flake)
    const editor = createTestEditor()
    await buildParagraph(editor, [{ text: ':tac' }], { segment: 0, offset: 4 })

    let committed: EmojiCommitResult | null = null
    await drainEnqueuedUpdates(editor, () => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        throw new Error('expected a range selection')
      }
      const anchorNode = selection.anchor.getNode()
      if (!$isTextNode(anchorNode)) {
        throw new Error('expected a text anchor')
      }
      const split = anchorNode.splitText(1)
      committed = $insertSelectedEmoji(taco, split[1])
    })

    expect(committed).toEqual({ id: 'taco', native: '🌮' })
    expect(rootText(editor)).toBe('🌮')
    expect(emojiNodeFormat(editor, '🌮')).toEqual([])
  })

  it('keeps a legitimately typed colon before the trigger untouched', async () => {
    // "note: :tac" — the trigger colon rides nodeToRemove, so the previous
    // sibling's trailing ':' (the legit one) must survive the commit
    const editor = createTestEditor()
    await buildParagraph(editor, [{ text: 'note: :tac' }], { segment: 0, offset: 10 })

    let committed: EmojiCommitResult | null = null
    await drainEnqueuedUpdates(editor, () => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        throw new Error('expected a range selection')
      }
      const anchorNode = selection.anchor.getNode()
      if (!$isTextNode(anchorNode)) {
        throw new Error('expected a text anchor')
      }
      const split = anchorNode.splitText(7)
      committed = $insertSelectedEmoji(taco, split[1])
    })

    expect(committed).toEqual({ id: 'taco', native: '🌮' })
    expect(rootText(editor)).toBe('note: 🌮')
  })
})
