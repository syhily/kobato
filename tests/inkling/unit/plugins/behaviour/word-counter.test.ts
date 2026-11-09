import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  BLUR_COMMAND,
  DecoratorNode,
  FOCUS_COMMAND,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cleanupSelectionEditors,
  createSelectionEditor,
  firstTextKey,
  seedSelectionEditor,
  selectAcrossParagraphs,
  selectText,
} from '#/inkling/utils/selection'
import { updateEditor } from '#/inkling/utils/test-editor'
import { createWordCounter, type WordCounterThrottle } from '@/inkling/plugins/behaviour/word-counter'
import { countWords } from '@/inkling/utils'
import { getTopLevelEditor } from '@/inkling/utils/lexical-internals'

vi.mock('@/inkling/utils', async (importActual) => {
  const actual = await importActual<typeof import('@/inkling/utils')>()
  return { ...actual, countWords: vi.fn(actual.countWords) }
})

// Deterministic harness for the headless word counter
// (src/plugins/behaviour/word-counter.ts): the throttle port is a synchronous
// passthrough, so flushes run inside the update that triggered them — no
// wall-clock sleeps. The React adapter (handle publish/clear) is covered by
// test/unit/plugins/WordCountPlugin.test.tsx.

const synchronousThrottle: WordCounterThrottle = (fn) => Object.assign(() => fn(), { cancel: () => {} })

function attachCounter(editor: LexicalEditor, onChange: (count: number) => void) {
  const counter = createWordCounter({ editor, onChange, throttleFn: synchronousThrottle })
  counter.attach()
  return counter
}

function attachSelectionCounter(
  editor: LexicalEditor,
  onSelectionChange: (count: number | null) => void,
  language?: string,
) {
  const counter = createWordCounter({ editor, onSelectionChange, language, throttleFn: synchronousThrottle })
  counter.attach()
  return counter
}

class TestDecoratorNode extends DecoratorNode<null> {
  __nestedEditor: LexicalEditor

  constructor(nestedEditor: LexicalEditor = createSelectionEditor({ root: false }), key?: NodeKey) {
    super(key)
    this.__nestedEditor = nestedEditor
  }

  static getType() {
    return 'test-decorator'
  }

  static clone(node: TestDecoratorNode) {
    return new TestDecoratorNode(node.__nestedEditor, node.__key)
  }

  createDOM() {
    return document.createElement('div')
  }

  updateDOM() {
    return false
  }

  decorate() {
    return null
  }

  getTextContent() {
    let text = ''
    this.__nestedEditor.getEditorState().read(() => {
      text = $getRoot().getTextContent()
    })
    return text
  }
}

function $createTestDecoratorNode(nestedEditor: LexicalEditor) {
  return new TestDecoratorNode(nestedEditor)
}

afterEach(() => {
  cleanupSelectionEditors()
})

describe('createWordCounter', () => {
  it('emits the initial count on attach', () => {
    const editor = createSelectionEditor({ root: false })
    const onChange = vi.fn()

    const counter = attachCounter(editor, onChange)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(0)
    counter.detach()
  })

  it('counts pre-existing content on attach', async () => {
    const editor = createSelectionEditor({ root: false })
    await updateEditor(
      editor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world foo')))
      },
      { discrete: true },
    )

    const onChange = vi.fn()
    const counter = attachCounter(editor, onChange)

    expect(onChange).toHaveBeenCalledWith(3)
    counter.detach()
  })

  it('passes language through to countWords (C7)', async () => {
    const editor = createSelectionEditor({ root: false })
    await updateEditor(
      editor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append(
          $createParagraphNode().append($createTextNode('我今天在家吃了好多好多好吃的现在的我非常开心非常满足')),
        )
      },
      { discrete: true },
    )

    const onChange = vi.fn()
    const counter = createWordCounter({ editor, onChange, language: 'zh', throttleFn: synchronousThrottle })
    counter.attach()

    // word-level via Intl.Segmenter (15), not the legacy char-level (26), and
    // the language reached the counting util
    expect(onChange).toHaveBeenCalledWith(15)
    expect(vi.mocked(countWords)).toHaveBeenCalledWith(expect.any(String), 'zh')
    counter.detach()
  })

  it('recounts incrementally after edits', async () => {
    const editor = createSelectionEditor({ root: false })
    const onChange = vi.fn()
    const counter = attachCounter(editor, onChange)

    await updateEditor(
      editor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
      },
      { discrete: true },
    )
    expect(onChange).toHaveBeenLastCalledWith(2)

    await updateEditor(
      editor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello')))
      },
      { discrete: true },
    )
    expect(onChange).toHaveBeenLastCalledWith(1)
    counter.detach()
  })

  it('does not emit when the count is unchanged', async () => {
    const editor = createSelectionEditor({ root: false })
    const onChange = vi.fn()
    const counter = attachCounter(editor, onChange)

    await updateEditor(
      editor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
      },
      { discrete: true },
    )
    expect(onChange).toHaveBeenLastCalledWith(2)
    onChange.mockClear()
    vi.mocked(countWords).mockClear()

    await updateEditor(
      editor,
      () => {
        const textNode = $getRoot().getFirstDescendant()
        if (!$isTextNode(textNode)) {
          throw new Error('Expected the word-count fixture to contain a text node')
        }
        textNode.setFormat(1)
      },
      { discrete: true },
    )

    // the flush ran (one block recomputed) but the count did not change
    expect(vi.mocked(countWords)).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    counter.detach()
  })

  it('remaps dirty keys to their root children for a small edit in a long document', async () => {
    const editor = createSelectionEditor({ root: false })
    await updateEditor(
      editor,
      () => {
        const root = $getRoot()
        root.clear()
        for (let i = 0; i < 100; i++) {
          root.append($createParagraphNode().append($createTextNode(`Paragraph ${i} has several words to count`)))
        }
      },
      { discrete: true },
    )

    const onChange = vi.fn()
    const counter = attachCounter(editor, onChange)
    expect(onChange).toHaveBeenLastCalledWith(700)
    vi.mocked(countWords).mockClear()

    await updateEditor(
      editor,
      () => {
        const firstParagraph = $getRoot().getFirstChild()
        if (!$isElementNode(firstParagraph)) {
          throw new Error('Expected the long-document fixture to start with a paragraph')
        }
        const firstText = firstParagraph.getFirstChild()
        if (!$isTextNode(firstText)) {
          throw new Error('Expected the first paragraph to contain a text node')
        }
        firstText.setTextContent('Paragraph zero has words')
      },
      { discrete: true },
    )

    // the dirty text node remaps to its root child, so only that one block is
    // recounted — a full recompute would call countWords once per block
    expect(vi.mocked(countWords)).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith(697)
    counter.detach()
  })

  it('drops removed blocks from the count', async () => {
    const editor = createSelectionEditor({ root: false })
    await updateEditor(
      editor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
        root.append($createParagraphNode().append($createTextNode('foo bar')))
      },
      { discrete: true },
    )

    const onChange = vi.fn()
    const counter = attachCounter(editor, onChange)
    expect(onChange).toHaveBeenLastCalledWith(4)

    await updateEditor(
      editor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
      },
      { discrete: true },
    )

    expect(onChange).toHaveBeenLastCalledWith(2)
    counter.detach()
  })

  it('falls back to a full recompute for nested-editor updates', async () => {
    const topLevelEditor = createSelectionEditor({ root: false, nodes: [TestDecoratorNode] })
    const nestedEditor = createSelectionEditor({ root: false, parentEditor: topLevelEditor })

    // Set up the top-level state before attaching so the initial full count
    // includes the top-level paragraph.
    await updateEditor(
      topLevelEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
        root.append($createTestDecoratorNode(nestedEditor))
      },
      { discrete: true },
    )

    const onChange = vi.fn()
    const counter = attachCounter(nestedEditor, onChange)

    expect(onChange).toHaveBeenCalledWith(2)
    onChange.mockClear()

    await updateEditor(
      nestedEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Nested content')))
      },
      { discrete: true },
    )

    expect(onChange).toHaveBeenLastCalledWith(4)
    counter.detach()
  })

  it('resolves the top-level editor from a grandchild editor', async () => {
    const topLevelEditor = createSelectionEditor({ root: false })
    const childEditor = createSelectionEditor({ root: false, parentEditor: topLevelEditor })
    const grandchildEditor = createSelectionEditor({ root: false, parentEditor: childEditor })

    expect(getTopLevelEditor(grandchildEditor)).toBe(topLevelEditor)

    await updateEditor(
      topLevelEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Top level words')))
      },
      { discrete: true },
    )

    const onChange = vi.fn()
    const counter = attachCounter(grandchildEditor, onChange)

    // Initial count is computed from the top-level editor.
    expect(onChange).toHaveBeenCalledWith(3)
    onChange.mockClear()

    // A grandchild update triggers the full-recompute fallback, which emits
    // unconditionally. Lexical caches RootNode.getTextContent() across
    // nested-editor boundaries, so the grandchild text does not reach the
    // top-level count; we assert the callback is reached with the current
    // top-level count.
    await updateEditor(
      grandchildEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Grandchild words')))
      },
      { discrete: true },
    )

    expect(onChange).toHaveBeenCalled()
    expect(onChange).toHaveBeenLastCalledWith(3)
    counter.detach()
  })

  it('stops emitting and cancels pending flushes on detach', async () => {
    const cancel = vi.fn()
    const recordingThrottle: WordCounterThrottle = (fn) => Object.assign(() => fn(), { cancel })

    const editor = createSelectionEditor({ root: false })
    const onChange = vi.fn()
    const counter = createWordCounter({ editor, onChange, throttleFn: recordingThrottle })
    counter.attach()
    expect(onChange).toHaveBeenCalledWith(0)

    counter.detach()

    expect(cancel).toHaveBeenCalledTimes(2)
    onChange.mockClear()

    await updateEditor(
      editor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
      },
      { discrete: true },
    )

    expect(onChange).not.toHaveBeenCalled()
  })
})

// Selection word count (upstream Ghost 0a04348143ab): the same engine reports
// the count owned by the focused AND editable editor, coordinated per
// TOP-LEVEL editor across the main editor and its nested caption editors.
// Selection-only counters must never pay for the full-document pass. The
// rootless editor harness keeps focus in the FOCUS_COMMAND/BLUR_COMMAND
// ledger — explicit and deterministic; the rooted specs use the DOM root.
function focusEditor(editor: LexicalEditor) {
  editor.dispatchCommand(FOCUS_COMMAND, new FocusEvent('focus'))
}

function blurEditor(editor: LexicalEditor) {
  editor.dispatchCommand(BLUR_COMMAND, new FocusEvent('blur'))
}

describe('createWordCounter selection channel', () => {
  beforeEach(() => {
    vi.mocked(countWords).mockClear()
  })

  it('emits null initially and for collapsed selections, then the selected count', async () => {
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['Hello world'])
    const onSelectionChange = vi.fn()

    const counter = attachSelectionCounter(editor, onSelectionChange)
    expect(onSelectionChange).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).toHaveBeenLastCalledWith(null)

    focusEditor(editor)

    const textKey = firstTextKey(editor)
    await selectText(editor, textKey, 5, 5)
    expect(onSelectionChange).toHaveBeenLastCalledWith(null)
    expect(onSelectionChange).toHaveBeenCalledTimes(1)

    await selectText(editor, textKey, 0, 5)
    expect(onSelectionChange).toHaveBeenLastCalledWith(1)

    await selectText(editor, textKey, 0, 11)
    expect(onSelectionChange).toHaveBeenLastCalledWith(2)
    expect(onSelectionChange.mock.calls.map(([count]) => count)).toEqual([null, 1, 2])

    counter.detach()
  })

  it('counts selected text across block boundaries', async () => {
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['Hello world', 'foo bar'])
    const onSelectionChange = vi.fn()

    const counter = attachSelectionCounter(editor, onSelectionChange)
    focusEditor(editor)
    await selectAcrossParagraphs(editor, 0, 3)

    expect(onSelectionChange).toHaveBeenLastCalledWith(3)
    counter.detach()
  })

  it('counts with the counter language (CJK word segmentation)', async () => {
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['我今天在家吃了好多好多好吃的现在的我非常开心非常满足'])
    const onSelectionChange = vi.fn()

    const counter = attachSelectionCounter(editor, onSelectionChange, 'zh')
    focusEditor(editor)
    await selectText(editor, firstTextKey(editor), 0, 26)

    expect(onSelectionChange).toHaveBeenLastCalledWith(15)
    expect(vi.mocked(countWords)).toHaveBeenCalledWith(expect.any(String), 'zh')
    counter.detach()
  })

  it('sees selection-only updates even though their dirty maps are empty', async () => {
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['Hello world'])
    const onSelectionChange = vi.fn()
    const counter = attachSelectionCounter(editor, onSelectionChange)
    focusEditor(editor)

    const textKey = firstTextKey(editor)
    // no content change: the only delta in this commit is the selection
    await selectText(editor, textKey, 0, 5)

    expect(onSelectionChange).toHaveBeenLastCalledWith(1)
    counter.detach()
  })

  it('distinguishes a zero-word selection from a collapsed selection', async () => {
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['!!!'])
    const onSelectionChange = vi.fn()

    const counter = attachSelectionCounter(editor, onSelectionChange)
    focusEditor(editor)

    await selectText(editor, firstTextKey(editor), 0, 3)
    expect(onSelectionChange).toHaveBeenLastCalledWith(0)

    await selectText(editor, firstTextKey(editor), 1, 1)
    expect(onSelectionChange).toHaveBeenLastCalledWith(null)

    expect(onSelectionChange.mock.calls.map(([count]) => count)).toEqual([null, 0, null])
    counter.detach()
  })

  it('clears on blur immediately and recomputes on focus', async () => {
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['Hello world'])
    const onSelectionChange = vi.fn()
    const counter = attachSelectionCounter(editor, onSelectionChange)
    focusEditor(editor)

    await selectText(editor, firstTextKey(editor), 0, 11)
    expect(onSelectionChange).toHaveBeenLastCalledWith(2)

    blurEditor(editor)
    expect(onSelectionChange).toHaveBeenLastCalledWith(null)

    focusEditor(editor)
    expect(onSelectionChange).toHaveBeenLastCalledWith(2)

    counter.detach()
  })

  it('yields null when the focused editor has a collapsed selection, not another editor stale count', async () => {
    const topLevelEditor = createSelectionEditor({ root: false, nodes: [TestDecoratorNode] })
    const nestedEditor = createSelectionEditor({ root: false, parentEditor: topLevelEditor })

    await updateEditor(
      topLevelEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
        root.append($createTestDecoratorNode(nestedEditor))
      },
      { discrete: true },
    )
    await seedSelectionEditor(nestedEditor, ['Nested content here'])

    const calls: Array<number | null> = []
    const onSelectionChange = (count: number | null) => calls.push(count)

    const topCounter = createWordCounter({ editor: topLevelEditor, onSelectionChange, throttleFn: synchronousThrottle })
    topCounter.attach()
    focusEditor(topLevelEditor)

    const nestedCounter = createWordCounter({
      editor: nestedEditor,
      onSelectionChange,
      throttleFn: synchronousThrottle,
    })
    nestedCounter.attach()
    focusEditor(nestedEditor)
    await selectText(nestedEditor, firstTextKey(nestedEditor), 7, 19)
    expect(calls.at(-1)).toBe(2)

    // focusing the main editor with a collapsed selection owns the channel:
    // the nested 2 must not survive as a fallback
    focusEditor(topLevelEditor)
    expect(calls.at(-1)).toBe(null)

    nestedCounter.detach()
    topCounter.detach()
  })

  it('keeps a nested count active when the main editor blurs without owning focus', async () => {
    const topLevelEditor = createSelectionEditor({ root: false, nodes: [TestDecoratorNode] })
    const nestedEditor = createSelectionEditor({ root: false, parentEditor: topLevelEditor })

    await updateEditor(
      topLevelEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
        root.append($createTestDecoratorNode(nestedEditor))
      },
      { discrete: true },
    )
    await seedSelectionEditor(nestedEditor, ['Nested content here'])

    const calls: Array<number | null> = []
    const onSelectionChange = (count: number | null) => calls.push(count)

    const topCounter = createWordCounter({ editor: topLevelEditor, onSelectionChange, throttleFn: synchronousThrottle })
    topCounter.attach()
    const nestedCounter = createWordCounter({
      editor: nestedEditor,
      onSelectionChange,
      throttleFn: synchronousThrottle,
    })
    nestedCounter.attach()
    focusEditor(nestedEditor)
    await selectText(nestedEditor, firstTextKey(nestedEditor), 7, 19)
    expect(calls.at(-1)).toBe(2)

    // a late main-editor blur must not clear the nested owner's count
    blurEditor(topLevelEditor)
    expect(calls.at(-1)).toBe(2)

    nestedCounter.detach()
    topCounter.detach()
  })

  it('drops a detached (deleted/unmounted) editor count and re-evaluates', async () => {
    const topLevelEditor = createSelectionEditor({ root: false, nodes: [TestDecoratorNode] })
    const nestedEditor = createSelectionEditor({ root: false, parentEditor: topLevelEditor })

    await updateEditor(
      topLevelEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
        root.append($createTestDecoratorNode(nestedEditor))
      },
      { discrete: true },
    )
    await seedSelectionEditor(nestedEditor, ['Nested content here'])

    const calls: Array<number | null> = []
    const onSelectionChange = (count: number | null) => calls.push(count)

    const topCounter = createWordCounter({ editor: topLevelEditor, onSelectionChange, throttleFn: synchronousThrottle })
    topCounter.attach()
    const nestedCounter = createWordCounter({
      editor: nestedEditor,
      onSelectionChange,
      throttleFn: synchronousThrottle,
    })
    nestedCounter.attach()
    focusEditor(nestedEditor)
    await selectText(nestedEditor, firstTextKey(nestedEditor), 7, 19)
    expect(calls.at(-1)).toBe(2)

    nestedCounter.detach()
    expect(calls.at(-1)).toBe(null)

    topCounter.detach()
  })

  it('does not let a later attach overwrite the nested owner with null', async () => {
    const topLevelEditor = createSelectionEditor({ root: false, nodes: [TestDecoratorNode] })
    const nestedEditor = createSelectionEditor({ root: false, parentEditor: topLevelEditor })

    await updateEditor(
      topLevelEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
        root.append($createTestDecoratorNode(nestedEditor))
      },
      { discrete: true },
    )
    await seedSelectionEditor(nestedEditor, ['Nested content here'])
    await selectText(nestedEditor, firstTextKey(nestedEditor), 7, 19)

    const calls: Array<number | null> = []
    const onSelectionChange = (count: number | null) => calls.push(count)

    const nestedCounter = createWordCounter({
      editor: nestedEditor,
      onSelectionChange,
      throttleFn: synchronousThrottle,
    })
    nestedCounter.attach()
    focusEditor(nestedEditor)
    expect(calls.at(-1)).toBe(2)

    // the top-level attach forces a delivery, but the focused nested editor
    // still owns the value — no trailing null
    const topCounter = createWordCounter({ editor: topLevelEditor, onSelectionChange, throttleFn: synchronousThrottle })
    topCounter.attach()
    expect(calls.at(-1)).toBe(2)
    expect(calls.filter((count) => count === null)).toHaveLength(1)

    topCounter.detach()
    nestedCounter.detach()
  })

  it('lets a programmatically focused editor win when the old BLUR was missed', async () => {
    const topLevelEditor = createSelectionEditor({ nodes: [TestDecoratorNode] })
    const nestedEditor = createSelectionEditor({ parentEditor: topLevelEditor })

    await updateEditor(
      topLevelEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
        root.append($createTestDecoratorNode(nestedEditor))
      },
      { discrete: true },
    )
    await seedSelectionEditor(nestedEditor, ['Nested content here'])

    const calls: Array<number | null> = []
    const onSelectionChange = (count: number | null) => calls.push(count)
    const topCounter = createWordCounter({ editor: topLevelEditor, onSelectionChange, throttleFn: synchronousThrottle })
    topCounter.attach()
    const nestedCounter = createWordCounter({
      editor: nestedEditor,
      onSelectionChange,
      throttleFn: synchronousThrottle,
    })
    nestedCounter.attach()

    const activeElementSpy = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(topLevelEditor.getRootElement())

    await selectText(topLevelEditor, firstTextKey(topLevelEditor), 0, 5)
    expect(calls.at(-1)).toBe(1)

    // focus moves without FOCUS/BLUR commands reaching the editors
    activeElementSpy.mockReturnValue(nestedEditor.getRootElement())
    await selectText(nestedEditor, firstTextKey(nestedEditor), 7, 19)
    expect(calls.at(-1)).toBe(2)

    nestedCounter.detach()
    topCounter.detach()
    activeElementSpy.mockRestore()
    topLevelEditor.getRootElement()?.remove()
    nestedEditor.getRootElement()?.remove()
  })

  it('keeps a propagated nested FOCUS/BLUR from letting the parent claim the ledger', async () => {
    const topLevelEditor = createSelectionEditor({ root: false, nodes: [TestDecoratorNode] })
    const nestedEditor = createSelectionEditor({ root: false, parentEditor: topLevelEditor })

    await updateEditor(
      topLevelEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
        root.append($createTestDecoratorNode(nestedEditor))
      },
      { discrete: true },
    )
    await seedSelectionEditor(nestedEditor, ['Nested content here'])

    const calls: Array<number | null> = []
    const onSelectionChange = (count: number | null) => calls.push(count)
    const topCounter = createWordCounter({ editor: topLevelEditor, onSelectionChange, throttleFn: synchronousThrottle })
    topCounter.attach()
    const nestedCounter = createWordCounter({
      editor: nestedEditor,
      onSelectionChange,
      throttleFn: synchronousThrottle,
    })
    nestedCounter.attach()

    focusEditor(nestedEditor)
    await selectText(nestedEditor, firstTextKey(nestedEditor), 7, 19)
    expect(calls.at(-1)).toBe(2)

    // FOCUS propagates to the parent; its collapsed main selection must not
    // claim the rootless ledger
    focusEditor(nestedEditor)
    expect(calls.at(-1)).toBe(2)

    // a parent BLUR that does not own the ledger leaves the nested count alone
    blurEditor(topLevelEditor)
    expect(calls.at(-1)).toBe(2)

    // the nested editor's own blur clears it
    blurEditor(nestedEditor)
    expect(calls.at(-1)).toBeNull()

    nestedCounter.detach()
    topCounter.detach()
  })

  it('dedups a shared callback across main and nested counters', async () => {
    const topLevelEditor = createSelectionEditor({ root: false, nodes: [TestDecoratorNode] })
    const nestedEditor = createSelectionEditor({ root: false, parentEditor: topLevelEditor })

    await updateEditor(
      topLevelEditor,
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
        root.append($createTestDecoratorNode(nestedEditor))
      },
      { discrete: true },
    )
    await seedSelectionEditor(nestedEditor, ['Nested content here'])

    const calls: Array<number | null> = []
    const onSelectionChange = (count: number | null) => calls.push(count)
    const topCounter = createWordCounter({ editor: topLevelEditor, onSelectionChange, throttleFn: synchronousThrottle })
    topCounter.attach()
    expect(calls).toEqual([null])

    // the same callback is already at null — attaching the nested counter
    // must not emit the same value again
    const nestedCounter = createWordCounter({
      editor: nestedEditor,
      onSelectionChange,
      throttleFn: synchronousThrottle,
    })
    nestedCounter.attach()
    expect(calls).toEqual([null])

    focusEditor(nestedEditor)
    await selectText(nestedEditor, firstTextKey(nestedEditor), 7, 19)
    expect(calls).toEqual([null, 2])

    nestedCounter.detach()
    topCounter.detach()
  })

  it('recounts selection and document when setLanguage changes the segmentation', async () => {
    const editor = createSelectionEditor({ root: false })
    const cjk = '我今天在家吃了好多好多好吃的现在的我非常开心非常满足'
    await seedSelectionEditor(editor, [cjk])
    const onChange = vi.fn()
    const calls: Array<number | null> = []
    const counter = createWordCounter({
      editor,
      onChange,
      onSelectionChange: (count) => calls.push(count),
      throttleFn: synchronousThrottle,
    })
    counter.attach()
    // no language: the regex fallback counts each CJK character
    expect(onChange).toHaveBeenLastCalledWith(cjk.length)

    focusEditor(editor)
    await selectText(editor, firstTextKey(editor), 0, cjk.length)
    expect(calls.at(-1)).toBe(cjk.length)

    counter.setLanguage('zh')
    expect(calls.at(-1)).toBe(15)
    expect(onChange).toHaveBeenLastCalledWith(15)

    // the same segmentation does not re-emit either channel
    const selectionCallsBefore = calls.length
    const onChangeCallsBefore = onChange.mock.calls.length
    counter.setLanguage('zh-CN')
    expect(calls).toHaveLength(selectionCallsBefore)
    expect(onChange.mock.calls).toHaveLength(onChangeCallsBefore)

    counter.detach()
  })

  it('never runs the full-document count for a selection-only consumer', async () => {
    const editor = createSelectionEditor({ root: false })
    const paragraphs = Array.from({ length: 40 }, (_, index) => `Paragraph ${index} with several words`)
    await seedSelectionEditor(editor, paragraphs)
    vi.mocked(countWords).mockClear()

    const onSelectionChange = vi.fn()
    const counter = attachSelectionCounter(editor, onSelectionChange)
    focusEditor(editor)

    // no selection yet: nothing counted at all
    expect(vi.mocked(countWords)).not.toHaveBeenCalled()

    await selectText(editor, firstTextKey(editor), 0, 9)
    expect(vi.mocked(countWords)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(countWords).mock.calls[0]?.[0]).toBe('Paragraph')

    // a content edit only recounts the (unchanged) selected text — a
    // document pass would call countWords once per block
    vi.mocked(countWords).mockClear()
    await updateEditor(
      editor,
      () => {
        const paragraph = $getRoot().getLastChild()
        const text = $isElementNode(paragraph) ? paragraph.getFirstChild() : null
        if ($isTextNode(text)) {
          text.setTextContent('changed words here')
        }
      },
      { discrete: true },
    )
    expect(vi.mocked(countWords)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(countWords).mock.calls[0]?.[0]).toBe('Paragraph')

    counter.detach()
  })

  it('cancels the selection flush on detach and re-evaluates the combined count', async () => {
    const cancel = vi.fn()
    const recordingThrottle: WordCounterThrottle = (fn) => Object.assign(() => fn(), { cancel })
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['Hello world'])

    const calls: Array<number | null> = []
    const counter = createWordCounter({
      editor,
      onSelectionChange: (count) => calls.push(count),
      throttleFn: recordingThrottle,
    })
    counter.attach()
    focusEditor(editor)
    await selectText(editor, firstTextKey(editor), 0, 5)
    expect(calls).toEqual([null, 1])

    counter.detach()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([null, 1, null])
  })

  it('keeps each counter instance separate when two share one editor', async () => {
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['Hello world'])

    const callsA: Array<number | null> = []
    const callsB: Array<number | null> = []
    const counterA = createWordCounter({
      editor,
      onSelectionChange: (count) => callsA.push(count),
      throttleFn: synchronousThrottle,
    })
    counterA.attach()
    const counterB = createWordCounter({
      editor,
      onSelectionChange: (count) => callsB.push(count),
      throttleFn: synchronousThrottle,
    })
    counterB.attach()
    focusEditor(editor)
    await selectText(editor, firstTextKey(editor), 0, 5)
    // per-callback dedup: each callback receives the combined value
    expect(callsA.at(-1)).toBe(1)
    expect(callsB.at(-1)).toBe(1)

    // detaching A must remove only A's entry: B still owns the editor, so the
    // combined count does not fall back to null
    const callsAfterSelection = callsA.length
    counterA.detach()
    expect(callsA).toHaveLength(callsAfterSelection)
    expect(callsA.at(-1)).toBe(1)

    // B is still attached and sees later changes
    await selectText(editor, firstTextKey(editor), 0, 11)
    expect(callsB.at(-1)).toBe(2)

    counterB.detach()
  })

  it('delivers the current value to a callback with no prior emission entry', async () => {
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['Hello world'])

    const callsA: Array<number | null> = []
    const counterA = createWordCounter({
      editor,
      onSelectionChange: (count) => callsA.push(count),
      throttleFn: synchronousThrottle,
    })
    counterA.attach()
    focusEditor(editor)
    await selectText(editor, firstTextKey(editor), 0, 5)
    expect(callsA.at(-1)).toBe(1)

    // same value as the last emission (forced) — the replacement callback
    // still receives it
    const callsB: Array<number | null> = []
    const counterB = createWordCounter({
      editor,
      onSelectionChange: (count) => callsB.push(count),
      throttleFn: synchronousThrottle,
    })
    counterB.attach()
    expect(callsB).toEqual([1])

    counterA.detach()
    counterB.detach()
  })

  it('removes a read-only editor from the selection and restores it when editable', async () => {
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['Hello world'])
    const onSelectionChange = vi.fn()

    const counter = attachSelectionCounter(editor, onSelectionChange)
    focusEditor(editor)
    await selectText(editor, firstTextKey(editor), 0, 5)
    expect(onSelectionChange).toHaveBeenLastCalledWith(1)

    editor.setEditable(false)
    expect(onSelectionChange).toHaveBeenLastCalledWith(null)

    editor.setEditable(true)
    expect(onSelectionChange).toHaveBeenLastCalledWith(1)

    counter.detach()
  })

  it('attaches no update listener when constructed without callbacks', () => {
    const editor = createSelectionEditor({ root: false })
    const registerUpdateListener = vi.spyOn(editor, 'registerUpdateListener')

    const counter = createWordCounter({ editor })
    counter.attach()
    counter.detach()

    expect(registerUpdateListener).not.toHaveBeenCalled()
    registerUpdateListener.mockRestore()
  })

  it('keeps onChange and onSelectionChange independent on the same counter', async () => {
    const editor = createSelectionEditor({ root: false })
    await seedSelectionEditor(editor, ['Hello world'])
    const onChange = vi.fn()
    const onSelectionChange = vi.fn()

    const counter = createWordCounter({
      editor,
      onChange,
      onSelectionChange,
      throttleFn: synchronousThrottle,
    })
    counter.attach()
    focusEditor(editor)

    expect(onChange).toHaveBeenLastCalledWith(2)
    expect(onSelectionChange).toHaveBeenLastCalledWith(null)

    await selectText(editor, firstTextKey(editor), 0, 5)
    expect(onSelectionChange).toHaveBeenLastCalledWith(1)
    expect(onChange).toHaveBeenLastCalledWith(2)

    counter.detach()
  })
})
