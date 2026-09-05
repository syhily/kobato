import { $createListItemNode, $createListNode } from '@lexical/list'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { drainEnqueuedUpdates } from '#/utils/test-editor'
import DEFAULT_NODES from '@/nodes/DefaultNodes'
// Characterization pins for the card-menu trigger module
// (src/plugins/behaviour/card-menu-trigger.ts): the slash valid-press
// grammar, the slash query/close verdicts, and the plus caret/hover/
// selectionchange policy, driven headlessly through the registrations and
// resolvers. The mounted-plugin wiring (keypress → open, verdict → render)
// stays pinned in test/unit/plugins/SlashCardMenuPlugin.test.tsx and
// PlusCardMenuPlugin.test.tsx.
//
// Harness notes:
// - The editor is set non-editable so Lexical never reconciles the DOM
//   selection (mirroring test/unit/plugins/behaviour/at-link.test.ts).
// - The native-selection facts the module reads come from a window.getSelection
//   mock (the same seam both plugin suites use): a real setBaseAndExtent
//   makes jsdom fire an async 'selectionchange' that Lexical answers with a
//   commit of its own, racing the verdict assertions.
// - jsdom has no document.elementFromPoint — hover cases stub it directly.
import {
  isSlashTriggerPress,
  registerPlusCardMenuTrigger,
  registerSlashCardMenuTrigger,
  resolvePlusHoverButtonVerdict,
  shouldHidePlusButtonOnSelectionChange,
  type PlusButtonVerdict,
  type SlashMenuVerdict,
  type SlashPressEvent,
} from '@/plugins/behaviour/card-menu-trigger'

function createTestEditor(): LexicalEditor {
  return createEditor({
    namespace: 'test',
    nodes: DEFAULT_NODES,
    onError: () => {},
    theme: {},
  })
}

// Lexical 0.46 commits updates on a microtask, and listener-triggered
// cascade updates defer again — the harness's drainEnqueuedUpdates drains
// the whole queue so assertions see the settled state.

// Build a single top-level paragraph carrying `text` ('' → no text child),
// with an optional selection: text-point offsets on the text node when the
// paragraph is non-empty, an element point on the paragraph when it is empty.
async function buildParagraph(
  editor: LexicalEditor,
  text: string,
  caret: { anchorOffset: number; focusOffset?: number } | null = null,
) {
  await drainEnqueuedUpdates(editor, () => {
    const root = $getRoot()
    root.clear()
    const paragraph = $createParagraphNode()
    if (text === '') {
      root.append(paragraph)
      if (caret) {
        paragraph.select(caret.anchorOffset, caret.focusOffset ?? caret.anchorOffset)
      }
      return
    }
    const textNode = $createTextNode(text)
    paragraph.append(textNode)
    root.append(paragraph)
    if (caret) {
      textNode.select(caret.anchorOffset, caret.focusOffset ?? caret.anchorOffset)
    }
  })
}

// Build a bullet list with a single item carrying `text` and a collapsed
// caret inside it — the selected node's top-level element is the list, not a
// paragraph.
async function buildListItem(editor: LexicalEditor, text: string, caretOffset = 0) {
  await drainEnqueuedUpdates(editor, () => {
    const root = $getRoot()
    root.clear()
    const textNode = $createTextNode(text)
    const item = $createListItemNode()
    item.append(textNode)
    const list = $createListNode('bullet')
    list.append(item)
    root.append(list)
    textNode.select(caretOffset, caretOffset)
  })
}

function getEditorTextNode(rootElement: HTMLElement): Text {
  const textNode = rootElement.querySelector('[data-lexical-text="true"]')?.firstChild
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    throw new Error('expected a rendered text node')
  }
  return textNode as Text
}

// The native selection as plain facts for the module's resolvers; anchorNode
// null models "no native selection" (rangeCount 0). The mocked facts must
// mirror the editor-state selection: Lexical re-derives the pending editor
// selection from the DOM selection at the start of every editor.update
// ($internalCreateSelection), so a mock that disagrees with the editor state
// silently rewrites the selection the next update sees.
function mockNativeSelection(
  anchorNode: Node | null,
  { anchorOffset = 0, focusNode, focusOffset }: { anchorOffset?: number; focusNode?: Node; focusOffset?: number } = {},
) {
  const resolvedFocusNode = focusNode ?? anchorNode
  const resolvedFocusOffset = focusOffset ?? anchorOffset
  return vi.spyOn(window, 'getSelection').mockReturnValue({
    anchorNode,
    focusNode: resolvedFocusNode,
    anchorOffset,
    focusOffset: resolvedFocusOffset,
    isCollapsed: anchorNode === resolvedFocusNode && anchorOffset === resolvedFocusOffset,
    rangeCount: anchorNode ? 1 : 0,
    getRangeAt: () => new Range(),
    removeAllRanges: () => {},
    addRange: () => {},
    setBaseAndExtent: () => {},
    toString: () => '',
  } as unknown as Selection)
}

const slashPress = (overrides: Partial<SlashPressEvent> = {}): SlashPressEvent => ({
  key: '/',
  isComposing: false,
  ctrlKey: false,
  metaKey: false,
  ...overrides,
})

// jsdom has no document.elementFromPoint; the hover policy reads it, so
// hover cases stub it with the element the hit test should land on.
function stubElementFromPoint(element: Element | null) {
  const mock = vi.fn(() => element)
  ;(document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = mock
  return mock
}

describe('card-menu-trigger', () => {
  let editor: LexicalEditor
  let rootElement: HTMLDivElement

  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    Reflect.deleteProperty(document, 'elementFromPoint')

    editor = createTestEditor()
    rootElement = document.createElement('div')
    document.body.appendChild(rootElement)
    editor.setRootElement(rootElement)
    // the module only reads editor/DOM state; non-editable keeps Lexical
    // from reconciling the DOM selection over the getSelection mock
    editor.setEditable(false)

    return () => {
      rootElement.remove()
      document.body.innerHTML = ''
      Reflect.deleteProperty(document, 'elementFromPoint')
    }
  })

  describe('isSlashTriggerPress', () => {
    // the grammar asks rootElement.matches(':focus'); a real focus() makes
    // jsdom reconcile (and collapse) the editor's range selections, so the
    // :focus answer is mocked instead
    let rootFocused: boolean

    beforeEach(() => {
      rootFocused = true
      vi.spyOn(rootElement, 'matches').mockImplementation((selector: string) => selector === ':focus' && rootFocused)
    })

    it('accepts / with a collapsed caret on an empty paragraph', async () => {
      await buildParagraph(editor, '', { anchorOffset: 0 })
      expect(isSlashTriggerPress(editor, slashPress())).toBe(true)
    })

    it('accepts / with a full-paragraph selection in either direction', async () => {
      await buildParagraph(editor, 'hello', { anchorOffset: 0, focusOffset: 5 })
      expect(isSlashTriggerPress(editor, slashPress())).toBe(true)

      await buildParagraph(editor, 'hello', { anchorOffset: 5, focusOffset: 0 })
      expect(isSlashTriggerPress(editor, slashPress())).toBe(true)
    })

    it('rejects / with a partial-paragraph selection', async () => {
      await buildParagraph(editor, 'hello', { anchorOffset: 0, focusOffset: 3 })
      expect(isSlashTriggerPress(editor, slashPress())).toBe(false)
    })

    it('rejects / with a collapsed caret in non-empty text', async () => {
      await buildParagraph(editor, 'hello', { anchorOffset: 5 })
      expect(isSlashTriggerPress(editor, slashPress())).toBe(false)
    })

    it('rejects / when the top-level element is not a paragraph', async () => {
      await buildListItem(editor, 'hello', 2)
      expect(isSlashTriggerPress(editor, slashPress())).toBe(false)
    })

    it('rejects / when there is no range selection', async () => {
      await buildParagraph(editor, '', { anchorOffset: 0 })
      await drainEnqueuedUpdates(editor, () => {
        $setSelection(null)
      })
      expect(isSlashTriggerPress(editor, slashPress())).toBe(false)
    })

    it('rejects keys with modifiers, mid-composition, and non-/ keys', async () => {
      await buildParagraph(editor, '', { anchorOffset: 0 })
      expect(isSlashTriggerPress(editor, slashPress({ ctrlKey: true }))).toBe(false)
      expect(isSlashTriggerPress(editor, slashPress({ metaKey: true }))).toBe(false)
      expect(isSlashTriggerPress(editor, slashPress({ isComposing: true }))).toBe(false)
      expect(isSlashTriggerPress(editor, slashPress({ key: 'a' }))).toBe(false)
    })

    it('rejects / when the editor root is not focused', async () => {
      await buildParagraph(editor, '', { anchorOffset: 0 })
      rootFocused = false
      expect(isSlashTriggerPress(editor, slashPress())).toBe(false)
    })
  })

  describe('registerSlashCardMenuTrigger', () => {
    let verdicts: SlashMenuVerdict[]

    beforeEach(() => {
      verdicts = []
      registerSlashCardMenuTrigger(editor, { onVerdict: (verdict) => verdicts.push(verdict) })
    })

    it('emits the typed query and command params with the leased cursor range', async () => {
      await buildParagraph(editor, '/html en extra', { anchorOffset: 14 })
      mockNativeSelection(getEditorTextNode(rootElement), { anchorOffset: 14 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toHaveLength(1)
      const verdict = verdicts[0]
      expect(verdict).toMatchObject({ type: 'query', query: 'html', commandParams: ['en', 'extra'] })
      expect(verdict.type === 'query' && verdict.cursorRange).toBeInstanceOf(Range)
    })

    it('emits an empty query and no params for a bare /', async () => {
      await buildParagraph(editor, '/', { anchorOffset: 1 })
      mockNativeSelection(getEditorTextNode(rootElement), { anchorOffset: 1 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'query', query: '', commandParams: [], cursorRange: expect.any(Range) }])
    })

    it('closes when the caret sits in a paragraph not starting with /', async () => {
      await buildParagraph(editor, 'image', { anchorOffset: 2 })
      mockNativeSelection(getEditorTextNode(rootElement), { anchorOffset: 2 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'close' }])
    })

    it('closes when the top-level element is not a paragraph', async () => {
      await buildListItem(editor, '/x', 2)
      mockNativeSelection(getEditorTextNode(rootElement), { anchorOffset: 2 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'close' }])
    })

    it('closes when the selection is not collapsed', async () => {
      await buildParagraph(editor, '/x', { anchorOffset: 0, focusOffset: 2 })
      const textNode = getEditorTextNode(rootElement)
      mockNativeSelection(textNode, { anchorOffset: 0, focusNode: textNode, focusOffset: 2 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'close' }])
    })

    it('closes when there is no range selection', async () => {
      await buildParagraph(editor, '/x', { anchorOffset: 2 })
      mockNativeSelection(getEditorTextNode(rootElement), { anchorOffset: 2 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {
        $setSelection(null)
      })

      expect(verdicts).toEqual([{ type: 'close' }])
    })

    it('closes when the native caret is not a text node', async () => {
      await buildParagraph(editor, '/x', { anchorOffset: 2 })
      const paragraph = rootElement.querySelector('p')
      if (!paragraph) {
        throw new Error('expected a rendered paragraph')
      }
      mockNativeSelection(paragraph)
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'close' }])
    })

    it('closes when the native caret is outside the editor root', async () => {
      await buildParagraph(editor, '/x', { anchorOffset: 2 })
      const outside = document.createElement('div')
      outside.textContent = 'outside'
      document.body.appendChild(outside)
      if (!outside.firstChild) {
        throw new Error('expected a text node')
      }
      mockNativeSelection(outside.firstChild)
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'close' }])
    })

    it('emits nothing when a non-collapsed selection lands inside a card-menu section', async () => {
      await buildParagraph(editor, '/x', { anchorOffset: 0, focusOffset: 2 })
      const section = document.createElement('div')
      section.setAttribute('data-card-menu-section', 'label')
      const span = document.createElement('span')
      span.textContent = 'Image'
      section.appendChild(span)
      document.body.appendChild(section)
      mockNativeSelection(span)
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([])
    })

    it('emits nothing mid-composition', async () => {
      const composing = vi.spyOn(editor, 'isComposing').mockReturnValue(true)
      await buildParagraph(editor, '/x', { anchorOffset: 2 })
      mockNativeSelection(getEditorTextNode(rootElement), { anchorOffset: 2 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([])
      composing.mockRestore()
    })

    it('stops emitting after unregistration', async () => {
      // separate channel: the describe-level registration stays active and
      // keeps filling `verdicts`, which this test never reads
      let extra: SlashMenuVerdict[] = []
      const unregister = registerSlashCardMenuTrigger(editor, { onVerdict: (verdict) => extra.push(verdict) })
      await buildParagraph(editor, '/x', { anchorOffset: 2 })
      mockNativeSelection(getEditorTextNode(rootElement), { anchorOffset: 2 })
      extra = []

      await drainEnqueuedUpdates(editor, () => {})
      expect(extra).toEqual([{ type: 'query', query: 'x', commandParams: [], cursorRange: expect.any(Range) }])

      unregister()
      extra = []

      await drainEnqueuedUpdates(editor, () => {})
      expect(extra).toEqual([])
    })
  })

  describe('registerPlusCardMenuTrigger', () => {
    let verdicts: PlusButtonVerdict[]

    beforeEach(() => {
      verdicts = []
      registerPlusCardMenuTrigger(editor, { onVerdict: (verdict) => verdicts.push(verdict) })
    })

    it('shows the button anchored to the caret paragraph when it is empty', async () => {
      await buildParagraph(editor, '', { anchorOffset: 0 })
      const paragraph = rootElement.querySelector('p')
      if (!paragraph) {
        throw new Error('expected a rendered paragraph')
      }
      mockNativeSelection(paragraph)
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'show', paragraph }])
    })

    it('hides the button when the caret sits in non-empty text', async () => {
      await buildParagraph(editor, 'hello', { anchorOffset: 2 })
      mockNativeSelection(getEditorTextNode(rootElement), { anchorOffset: 2 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'hide' }])
    })

    it('hides the button when the selection is not collapsed', async () => {
      await buildParagraph(editor, 'hello', { anchorOffset: 0, focusOffset: 3 })
      const textNode = getEditorTextNode(rootElement)
      mockNativeSelection(textNode, { anchorOffset: 0, focusNode: textNode, focusOffset: 3 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'hide' }])
    })

    it('hides the button when there is no range selection', async () => {
      await buildParagraph(editor, '', { anchorOffset: 0 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {
        $setSelection(null)
      })

      expect(verdicts).toEqual([{ type: 'hide' }])
    })

    it('hides the button when the native anchor is not the caret paragraph itself', async () => {
      await buildParagraph(editor, '', { anchorOffset: 0 })
      // an empty paragraph renders a <br> placeholder — anchor the native
      // selection on it (an element anchor that is not the <p> itself)
      const paragraph = rootElement.querySelector('p')
      if (!paragraph?.firstChild) {
        throw new Error('expected a rendered paragraph')
      }
      mockNativeSelection(paragraph.firstChild)
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'hide' }])
    })

    it('hides the button when the native anchor is a <p> outside the editor root', async () => {
      await buildParagraph(editor, '', { anchorOffset: 0 })
      const outside = document.createElement('p')
      document.body.appendChild(outside)
      mockNativeSelection(outside)
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'hide' }])
    })

    it('hides the button when there is no native selection at all', async () => {
      await buildParagraph(editor, '', { anchorOffset: 0 })
      mockNativeSelection(null)
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([{ type: 'hide' }])
    })

    it('emits nothing mid-composition', async () => {
      const composing = vi.spyOn(editor, 'isComposing').mockReturnValue(true)
      await buildParagraph(editor, 'hello', { anchorOffset: 2 })
      verdicts = []

      await drainEnqueuedUpdates(editor, () => {})

      expect(verdicts).toEqual([])
      composing.mockRestore()
    })
  })

  describe('resolvePlusHoverButtonVerdict', () => {
    it('shows the button for a hovered empty paragraph', async () => {
      await buildParagraph(editor, '')
      const paragraph = rootElement.querySelector('p')
      if (!paragraph) {
        throw new Error('expected a rendered paragraph')
      }
      stubElementFromPoint(paragraph)

      expect(resolvePlusHoverButtonVerdict(editor, 10, 10)).toEqual({ type: 'show', paragraph })
    })

    it('nudges the hit-test point 40px inward when the mouse is left of the container (left-gutter fudge)', async () => {
      await buildParagraph(editor, '')
      const paragraph = rootElement.querySelector('p')
      if (!paragraph) {
        throw new Error('expected a rendered paragraph')
      }
      vi.spyOn(rootElement, 'getBoundingClientRect').mockReturnValue({
        bottom: 20,
        height: 20,
        left: 100,
        right: 300,
        top: 0,
        width: 200,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect)
      const elementFromPoint = stubElementFromPoint(paragraph)

      expect(resolvePlusHoverButtonVerdict(editor, 50, 10)).toEqual({ type: 'show', paragraph })
      expect(elementFromPoint).toHaveBeenCalledWith(90, 10)
    })

    it('falls back to the caret verdict when the hover lands on other editor content', async () => {
      await drainEnqueuedUpdates(editor, () => {
        const root = $getRoot()
        root.clear()
        const first = $createParagraphNode()
        first.append($createTextNode('hello'))
        const second = $createParagraphNode()
        root.append(first, second)
        second.select(0, 0)
      })
      const paragraphs = rootElement.querySelectorAll('p')
      const [hovered, caretParagraph] = Array.from(paragraphs)
      stubElementFromPoint(hovered)
      mockNativeSelection(caretParagraph)

      expect(resolvePlusHoverButtonVerdict(editor, 10, 10)).toEqual({ type: 'show', paragraph: caretParagraph })
    })

    it('falls back to a hide verdict when the hover lands on content and the caret is in text', async () => {
      await buildParagraph(editor, 'hello', { anchorOffset: 2 })
      const paragraph = rootElement.querySelector('p')
      if (!paragraph) {
        throw new Error('expected a rendered paragraph')
      }
      stubElementFromPoint(paragraph)
      mockNativeSelection(getEditorTextNode(rootElement), { anchorOffset: 2 })

      expect(resolvePlusHoverButtonVerdict(editor, 10, 10)).toEqual({ type: 'hide' })
    })

    it('returns null when the hover is over a card', async () => {
      await buildParagraph(editor, '')
      const card = document.createElement('div')
      card.setAttribute('data-inkling-card', '')
      const span = document.createElement('span')
      card.appendChild(span)
      rootElement.appendChild(card)
      stubElementFromPoint(span)

      expect(resolvePlusHoverButtonVerdict(editor, 10, 10)).toBeNull()
    })

    it('returns null when the hover is outside the editor root', async () => {
      await buildParagraph(editor, '')
      stubElementFromPoint(document.body)

      expect(resolvePlusHoverButtonVerdict(editor, 10, 10)).toBeNull()
    })

    it('returns null when the editor has no root element', () => {
      const detached = createTestEditor()
      stubElementFromPoint(document.body)

      expect(resolvePlusHoverButtonVerdict(detached, 10, 10)).toBeNull()
    })
  })

  describe('shouldHidePlusButtonOnSelectionChange', () => {
    it('hides when the selection has no anchor', () => {
      expect(shouldHidePlusButtonOnSelectionChange(null, rootElement, null)).toBe(true)
    })

    it('hides when the anchor is outside the editor root', () => {
      const outside = document.createElement('div')
      document.body.appendChild(outside)
      expect(shouldHidePlusButtonOnSelectionChange(outside, rootElement, null)).toBe(true)
    })

    it('does not hide when the anchor is inside the editor root', () => {
      const inside = document.createElement('span')
      rootElement.appendChild(inside)
      expect(shouldHidePlusButtonOnSelectionChange(inside, rootElement, null)).toBe(false)
    })

    it('does not hide when the anchor is inside the open menu container', () => {
      const menu = document.createElement('div')
      const item = document.createElement('span')
      menu.appendChild(item)
      document.body.appendChild(menu)
      expect(shouldHidePlusButtonOnSelectionChange(item, rootElement, menu)).toBe(false)
    })

    it('hides when the anchor is outside the root even with a menu container present', () => {
      const menu = document.createElement('div')
      document.body.appendChild(menu)
      const outside = document.createElement('div')
      document.body.appendChild(outside)
      expect(shouldHidePlusButtonOnSelectionChange(outside, rootElement, menu)).toBe(true)
    })

    it('hides when the editor root is gone', () => {
      const anchor = document.createElement('span')
      document.body.appendChild(anchor)
      expect(shouldHidePlusButtonOnSelectionChange(anchor, null, null)).toBe(true)
    })
  })
})
