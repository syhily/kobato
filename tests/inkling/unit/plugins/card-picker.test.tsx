import { act, render, renderHook } from '@testing-library/react'
import { $createParagraphNode, $getNodeByKey, $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CardPickerRenderProps } from '@/inkling/nodes/cards/host-card-registry'

import { createCardPickerStoreWrapper } from '#/inkling/utils/card-picker-store'
import { mockComposerContext } from '#/inkling/utils/composer-context'
import { createTestEditor, tick, updateEditor } from '#/inkling/utils/test-editor'
import { useCardPicker } from '@/inkling/hooks/useCardPicker'
import { generateDecoratorNode } from '@/inkling/nodes/base/generate-decorator-node'
import { resolveCardInsertCommand } from '@/inkling/nodes/cards/card-commands'
import { getCardInsertRegistrations } from '@/inkling/nodes/cards/card-insert-commands'
import { getHostCard } from '@/inkling/nodes/cards/host-card-registry'
import { defineCard } from '@/inkling/nodes/cards/host-cards'
import { createCardSelectionStore } from '@/inkling/plugins/behaviour/cardSelectionStore'
import { registerCardCommands } from '@/inkling/plugins/behaviour/registerCardCommands'
import { CardInsertPlugin } from '@/inkling/plugins/CardInsertPlugin'
import { CardPickerHostPlugin } from '@/inkling/plugins/CardPickerHostPlugin'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

// The seam's fixture cards, registered at module top level mirroring the host
// idiom (defineCard before any composer mounts):
// - pickerWidget — the full picker spec with autoOpenOnInsert
// - manualPickerWidget — a picker without the auto-open flag
// - pickerlessWidget — no picker at all (the placeholder stays inert)
const pickerRender = vi.fn((_props: CardPickerRenderProps) => <div data-testid="picker-dialog" />)

const pickerWidget = defineCard({
  nodeType: 'pickerWidget',
  baseNode: generateDecoratorNode({
    nodeType: 'pickerWidget',
    properties: [{ name: 'src', default: '' }] as const,
  }),
  insert: {},
  toolbarLabel: 'picker-widget',
  picker: { render: pickerRender, autoOpenOnInsert: true },
  render: () => null,
})

const manualPickerWidget = defineCard({
  nodeType: 'manualPickerWidget',
  baseNode: generateDecoratorNode({ nodeType: 'manualPickerWidget' }),
  insert: {},
  toolbarLabel: 'manual-picker-widget',
  picker: { render: () => null },
  render: () => null,
})

const pickerlessWidget = defineCard({
  nodeType: 'pickerlessWidget',
  baseNode: generateDecoratorNode({ nodeType: 'pickerlessWidget' }),
  insert: {},
  toolbarLabel: 'pickerless-widget',
  render: () => null,
})

const FIXTURE_NODES = [pickerWidget.node, manualPickerWidget.node, pickerlessWidget.node]

/** Appends one fixture card to the root and resolves its key after commit. */
async function appendCard(editor: LexicalEditor, card: (typeof FIXTURE_NODES)[number], dataset = {}): Promise<NodeKey> {
  let key: NodeKey = ''
  await updateEditor(editor, () => {
    const node = new card(dataset)
    $getRoot().append(node)
    key = node.getKey()
  })
  return key
}

describe('the pick seam registration', () => {
  it('stores the picker spec verbatim on the host registry record', () => {
    expect(getHostCard('pickerWidget')?.spec.picker).toEqual({
      render: pickerRender,
      autoOpenOnInsert: true,
    })
    expect(getHostCard('manualPickerWidget')?.spec.picker?.autoOpenOnInsert).toBeUndefined()
    expect(getHostCard('pickerlessWidget')?.spec.picker).toBeUndefined()
  })

  it('projects pickerAutoOpen onto the host card insert registrations only', () => {
    const registrations = getCardInsertRegistrations()
    expect(registrations.find((registration) => registration.nodeType === 'pickerWidget')?.pickerAutoOpen).toBe(true)
    expect(registrations.find((registration) => registration.nodeType === 'manualPickerWidget')?.pickerAutoOpen).toBe(
      false,
    )
    // built-in cards never carry the flag — pickers are host-only
    expect(registrations.filter((registration) => registration.pickerAutoOpen).map((r) => r.nodeType)).toEqual([
      'pickerWidget',
    ])
  })
})

describe('useCardPicker', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor({ nodes: FIXTURE_NODES })
    mockComposerContext(editor)
  })

  it('opens the picker for a card that declares one and closes it again', async () => {
    const { store, wrapper } = createCardPickerStoreWrapper()
    const nodeKey = await appendCard(editor, pickerWidget.node, { src: 'x' })
    const { result } = renderHook(() => useCardPicker(), { wrapper })

    act(() => result.current.open(nodeKey))
    expect(store.getState().request).toEqual({ nodeKey, nodeType: 'pickerWidget' })

    act(() => result.current.close())
    expect(store.getState().request).toBeNull()
  })

  it('no-ops for a pickerless card and for a missing node', async () => {
    const { store, wrapper } = createCardPickerStoreWrapper()
    const pickerlessKey = await appendCard(editor, pickerlessWidget.node)
    const { result } = renderHook(() => useCardPicker(), { wrapper })

    act(() => result.current.open(pickerlessKey))
    act(() => result.current.open('missing-key'))
    expect(store.getState().request).toBeNull()
  })
})

describe('CardPickerHostPlugin', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor({ nodes: FIXTURE_NODES, headless: false })
    mockComposerContext(editor)
  })

  it('renders the picker spec exactly once for the active request, with editor/nodeKey/close', async () => {
    const { store, wrapper } = createCardPickerStoreWrapper()
    const nodeKey = await appendCard(editor, pickerWidget.node, { src: 'x' })
    const view = render(<CardPickerHostPlugin />, { wrapper })

    expect(view.queryByTestId('picker-dialog')).toBeNull()
    expect(pickerRender).not.toHaveBeenCalled()

    act(() => {
      store.setState({ request: { nodeKey, nodeType: 'pickerWidget' } })
    })
    expect(view.getAllByTestId('picker-dialog')).toHaveLength(1)
    expect(pickerRender).toHaveBeenCalledWith({ editor, nodeKey, close: expect.any(Function) })

    // the close prop drops the request and unmounts the picker
    const close = pickerRender.mock.calls[0]?.[0].close as () => void
    act(() => close())
    expect(store.getState().request).toBeNull()
    expect(view.queryByTestId('picker-dialog')).toBeNull()
  })

  it('drops the request when the card is deleted while the picker is open', async () => {
    const { store, wrapper } = createCardPickerStoreWrapper()
    const nodeKey = await appendCard(editor, pickerWidget.node, { src: 'x' })
    render(<CardPickerHostPlugin />, { wrapper })

    act(() => {
      store.setState({ request: { nodeKey, nodeType: 'pickerWidget' } })
    })
    expect(store.getState().request).not.toBeNull()

    await act(async () => {
      await updateEditor(editor, () => {
        $getNodeByKey(nodeKey)?.remove()
      })
      await tick()
    })
    expect(store.getState().request).toBeNull()
  })
})

describe('autoOpenOnInsert', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor({ nodes: FIXTURE_NODES })
    // the INSERT_CARD_COMMAND handler the registrar dispatches through
    registerCardCommands(editor, { store: createCardSelectionStore() })
    mockComposerContext(editor)
  })

  async function mountRegistrar() {
    const harness = createCardPickerStoreWrapper()
    renderHook(() => CardInsertPlugin(), { wrapper: harness.wrapper })
    await tick()
    return harness.store
  }

  async function seedSelection() {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      $getRoot().append(paragraph)
      paragraph.select()
    })
  }

  it('opens the picker on the freshly inserted node', async () => {
    const store = await mountRegistrar()
    await seedSelection()

    act(() => {
      editor.dispatchCommand(resolveCardInsertCommand('pickerWidget'), {})
    })

    const request = store.getState().request
    expect(request?.nodeType).toBe('pickerWidget')
    // Lexical 0.46 commits the insert on a microtask — drain before reading
    await tick()
    // the node landed under the request's key — the pick write resolves it
    editor.getEditorState().read(() => {
      expect($getNodeByKey(request?.nodeKey ?? '')?.getType()).toBe('pickerWidget')
    })
  })

  it('does not open the picker for an insert without the flag', async () => {
    const store = await mountRegistrar()
    await seedSelection()

    act(() => {
      editor.dispatchCommand(resolveCardInsertCommand('manualPickerWidget'), {})
    })

    expect(store.getState().request).toBeNull()
  })

  it('never opens the picker on an editor-state load — only the insert command triggers it', async () => {
    // serialize a document holding the card, then seed a fresh editor from it
    const source = createTestEditor({ nodes: FIXTURE_NODES })
    await updateEditor(source, () => {
      $getRoot().append(new pickerWidget.node({ src: 'x' }))
    })
    const serialized = JSON.stringify(source.getEditorState().toJSON())

    editor = createTestEditor({ nodes: FIXTURE_NODES })
    mockComposerContext(editor)
    editor.setEditorState(editor.parseEditorState(serialized))
    const store = await mountRegistrar()
    await tick()

    expect(store.getState().request).toBeNull()
    // the loaded card answers a manual open (the placeholder re-entry path)
    editor.getEditorState().read(() => {
      expect($getRoot().getFirstChild()?.getType()).toBe('pickerWidget')
    })
  })
})

describe('headless purity', () => {
  it('the headless surface never references the pick seam', () => {
    // `@/inkling/headless` is the react-free server surface (pinned by
    // tests/unit/shared/contracts/boundaries.test.ts); the seam's React
    // halves (hook, host plugin, context) must never leak into it. The
    // registry's picker fact is type-only — the card-layering-imports guard
    // pins host-card-registry's runtime imports React-free.
    const headless = readFileSync('src/inkling/headless.ts', 'utf8')
    expect(headless).not.toMatch(/useCardPicker|CardPickerHostPlugin|cardPickerStore|CardPickerStoreContext/)
  })
})
