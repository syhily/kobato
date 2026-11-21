import type { CardPickerRenderProps } from '@kobato/inkling-internal/nodes/cards/host-card-registry'

import { useCardPicker } from '@kobato/inkling-internal/hooks/useCardPicker'
import { useCardWriter } from '@kobato/inkling-internal/hooks/useCardWriter'
import { AudioNode } from '@kobato/inkling-internal/nodes/AudioNode'
import { generateDecoratorNode } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { resolveCardInsertCommand } from '@kobato/inkling-internal/nodes/cards/card-commands'
import { getCardInsertRegistrations } from '@kobato/inkling-internal/nodes/cards/card-insert-commands'
import {
  getHostCard,
  registerCardPicker,
  resolveCardPicker,
} from '@kobato/inkling-internal/nodes/cards/host-card-registry'
import { defineCard } from '@kobato/inkling-internal/nodes/cards/host-cards'
import { createCardPickerStore } from '@kobato/inkling-internal/plugins/behaviour/card-picker-store'
import { createCardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'
import { INSERT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { registerCardCommands } from '@kobato/inkling-internal/plugins/behaviour/register-card-commands'
import { CardInsertPlugin } from '@kobato/inkling-internal/plugins/CardInsertPlugin'
import { CardPickerHostPlugin } from '@kobato/inkling-internal/plugins/CardPickerHostPlugin'
import { CORE_PLUGINS, type CorePluginScope } from '@kobato/inkling-internal/plugins/CorePlugins'
import { createCardPickerStoreWrapper } from '@kobato/inkling/tests/utils/card-picker-store'
import { mockComposerContext } from '@kobato/inkling/tests/utils/composer-context'
import { createTestEditor, tick, updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import { HistoryPlugin, createEmptyHistoryState } from '@lexical/react/LexicalHistoryPlugin'
import { act, render, renderHook } from '@testing-library/react'
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  HISTORY_MERGE_TAG,
  UNDO_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical'
import { readdirSync, readFileSync } from 'node:fs'
import { useMemo, type ContextType, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

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

  it('no-ops on a read-only editor — a read-only surface never originates pick requests', async () => {
    const { store, wrapper } = createCardPickerStoreWrapper()
    const nodeKey = await appendCard(editor, pickerWidget.node, { src: 'x' })
    const { result } = renderHook(() => useCardPicker(), { wrapper })

    editor.setEditable(false)
    act(() => result.current.open(nodeKey))
    expect(store.getState().request).toBeNull()

    editor.setEditable(true)
    act(() => result.current.open(nodeKey))
    expect(store.getState().request).toEqual({ nodeKey, nodeType: 'pickerWidget' })
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
    expect(pickerRender).toHaveBeenCalledWith({ editor, nodeKey, close: expect.any(Function), fromInsert: false })

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

  it('drops the request immediately when the node is already gone at registration', async () => {
    const { store, wrapper } = createCardPickerStoreWrapper()
    const nodeKey = await appendCard(editor, pickerWidget.node, { src: 'x' })
    await updateEditor(editor, () => {
      $getNodeByKey(nodeKey)?.remove()
    })

    store.setState({ request: { nodeKey, nodeType: 'pickerWidget' } })
    render(<CardPickerHostPlugin />, { wrapper })
    expect(store.getState().request).toBeNull()
  })

  it('drops the active request on unmount — the readOnly toggle must not strand it', async () => {
    const { store, wrapper } = createCardPickerStoreWrapper()
    const nodeKey = await appendCard(editor, pickerWidget.node, { src: 'x' })
    const view = render(<CardPickerHostPlugin />, { wrapper })

    act(() => {
      store.setState({ request: { nodeKey, nodeType: 'pickerWidget' } })
    })
    expect(view.queryByTestId('picker-dialog')).not.toBeNull()

    view.unmount()
    expect(store.getState().request).toBeNull()
  })
})

describe('autoOpenOnInsert', () => {
  let editor: LexicalEditor

  let pickerStore: ReturnType<typeof createCardPickerStore>
  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor({ nodes: FIXTURE_NODES })
    pickerStore = createCardPickerStore()
    registerCardCommands(editor, { store: createCardSelectionStore(), pickerStore })
    mockComposerContext(editor)
  })

  async function mountRegistrar() {
    const harness = createCardPickerStoreWrapper({ store: pickerStore })
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

    await tick()

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

    editor.getEditorState().read(() => {
      expect($getRoot().getFirstChild()?.getType()).toBe('pickerWidget')
    })
  })
})

describe('the variant picker channel (registerCardPicker)', () => {
  const audioPickerRender = vi.fn((_props: CardPickerRenderProps) => <div data-testid="audio-picker" />)
  registerCardPicker('audio', { render: audioPickerRender })
  it('resolves the override for a picker-less built-in type, host spec first', () => {
    expect(resolveCardPicker('audio')?.render).toBe(audioPickerRender)

    expect(resolveCardPicker('pickerWidget')?.render).toBe(pickerRender)
    expect(resolveCardPicker('pickerlessWidget')).toBeUndefined()
  })

  it('enforces one picker per node type across both channels', () => {
    expect(() => registerCardPicker('audio', { render: () => null })).toThrow(/already registered/)
    expect(() => registerCardPicker('pickerWidget', { render: () => null })).toThrow(/already registered/)
    expect(() =>
      defineCard({
        nodeType: 'audio',
        baseNode: generateDecoratorNode({ nodeType: 'audioClone' }),
        toolbarLabel: 'audio-clone',
        picker: { render: () => null },
        render: () => null,
      }),
    ).toThrow(/already declared/)
    expect(() =>
      defineCard({
        nodeType: 'audioVariantWithPicker',
        baseNode: generateDecoratorNode({ nodeType: 'audioVariantWithPicker' }),
        toolbarLabel: 'audio-variant',
        picker: { render: () => null },
        render: () => null,
      }),
    ).not.toThrow()

    expect(() => registerCardPicker('audioVariantWithPicker', { render: () => null })).toThrow(/already registered/)
  })

  it('opens the override picker from useCardPicker for a built-in card node', async () => {
    const editor = createTestEditor({ nodes: [AudioNode] })
    mockComposerContext(editor)
    let nodeKey: NodeKey = ''
    await updateEditor(editor, () => {
      const node = new AudioNode({ src: 'https://example.com/song.mp3' })
      $getRoot().append(node)
      nodeKey = node.getKey()
    })

    const { store, wrapper } = createCardPickerStoreWrapper()
    const { result } = renderHook(() => useCardPicker(), { wrapper })
    act(() => result.current.open(nodeKey))
    expect(store.getState().request).toEqual({ nodeKey, nodeType: 'audio' })
  })

  it('renders the override picker in the host plugin', async () => {
    const editor = createTestEditor({ nodes: [AudioNode], headless: false })
    mockComposerContext(editor)
    let nodeKey: NodeKey = ''
    await updateEditor(editor, () => {
      const node = new AudioNode({ src: 'https://example.com/song.mp3' })
      $getRoot().append(node)
      nodeKey = node.getKey()
    })

    const { store, wrapper } = createCardPickerStoreWrapper()
    const view = render(<CardPickerHostPlugin />, { wrapper })
    act(() => {
      store.setState({ request: { nodeKey, nodeType: 'audio' } })
    })
    expect(view.getAllByTestId('audio-picker')).toHaveLength(1)
    expect(audioPickerRender).toHaveBeenCalledWith({ editor, nodeKey, close: expect.any(Function), fromInsert: false })
  })

  it('accepts autoOpenOnInsert on the variant channel — the flag rides the insert registration', () => {
    registerCardPicker('audioAutoOpenVariant', { render: () => null, autoOpenOnInsert: true })

    expect(resolveCardPicker('audioAutoOpenVariant')?.autoOpenOnInsert).toBe(true)
  })
  it('writes the pick request when INSERT_CARD_COMMAND carries openPicker: true', async () => {
    const editor = createTestEditor({ nodes: FIXTURE_NODES })
    mockComposerContext(editor)
    const pickerStore = createCardPickerStore()
    registerCardCommands(editor, { store: createCardSelectionStore(), pickerStore })
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      $getRoot().append(paragraph)
      paragraph.select()
    })

    await updateEditor(editor, () => {
      editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode: new pickerWidget.node({}), openPicker: true })
    })

    expect(pickerStore.getState().request).toMatchObject({ nodeType: 'pickerWidget', fromInsert: true })

    pickerStore.setState({ request: null })
    await updateEditor(editor, () => {
      editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode: new pickerWidget.node({}) })
    })
    expect(pickerStore.getState().request).toBeNull()
  })
})

describe('the picker host mount gate', () => {
  it('mounts only on non-nested, editable surfaces', () => {
    const entry = CORE_PLUGINS.find((plugin) => plugin.key === 'card-picker-host')
    expect(entry?.when).toBeDefined()
    const scope = { isNested: false, readOnly: false } as CorePluginScope
    expect(entry?.when?.(scope)).toBe(true)
    expect(entry?.when?.({ ...scope, readOnly: true })).toBe(false)
    expect(entry?.when?.({ ...scope, isNested: true })).toBe(false)
  })
})

describe('the insert-then-pick undo entry (fromInsert)', () => {
  let editor: LexicalEditor
  let pickerStore: ReturnType<typeof createCardPickerStore>

  type PickerWidgetNode = LexicalNode & { src: string }
  const isPickerWidgetNode = (node: unknown): node is PickerWidgetNode => node instanceof pickerWidget.node

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor({ nodes: FIXTURE_NODES })
    pickerStore = createCardPickerStore()
    registerCardCommands(editor, { store: createCardSelectionStore(), pickerStore })
    mockComposerContext(editor)
  })

  async function mountHistoryAndRegistrar() {
    const harness = createCardPickerStoreWrapper({ store: pickerStore })
    const actual = await vi.importActual<typeof import('@lexical/react/LexicalComposerContext')>(
      '@lexical/react/LexicalComposerContext',
    )
    function HistoryWrapper({ children }: { children: ReactNode }) {
      const contextValue = useMemo<ContextType<typeof actual.LexicalComposerContext>>(
        () => [editor, actual.createLexicalComposerContext(null, {})],
        [],
      )
      return (
        <actual.LexicalComposerContext.Provider value={contextValue}>{children}</actual.LexicalComposerContext.Provider>
      )
    }
    const historyState = createEmptyHistoryState()
    await act(async () => {
      renderHook(() => HistoryPlugin({ externalHistoryState: historyState }), { wrapper: HistoryWrapper })
      renderHook(() => CardInsertPlugin(), { wrapper: harness.wrapper })
      await tick()
    })
  }

  async function insertWithAutoOpen(): Promise<NodeKey> {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      $getRoot().append(paragraph)
      paragraph.select()
    })
    await act(async () => {
      editor.dispatchCommand(resolveCardInsertCommand('pickerWidget'), {})

      await tick()
    })
    const request = pickerStore.getState().request
    expect(request?.nodeType).toBe('pickerWidget')
    expect(request?.fromInsert).toBe(true)
    return request?.nodeKey ?? ''
  }

  function readCardSrc(nodeKey: NodeKey): string | null {
    return editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey)
      return isPickerWidgetNode(node) ? node.src : null
    })
  }

  function cardExists(nodeKey: NodeKey): boolean {
    return editor.getEditorState().read(() => $getNodeByKey(nodeKey) !== null)
  }

  async function undo() {
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined)
      await tick()
    })
  }

  it('merges a from-insert pick write into the insert entry — one undo retracts both', async () => {
    await mountHistoryAndRegistrar()
    const nodeKey = await insertWithAutoOpen()

    const seenTags: string[][] = []
    editor.registerUpdateListener(({ tags }) => {
      seenTags.push([...tags])
    })
    const { result } = renderHook(() => useCardWriter(nodeKey, isPickerWidgetNode))
    await act(async () => {
      result.current(
        (node) => {
          node.src = 'picked'
        },
        { mergeHistory: true },
      )
      await tick()
    })
    expect(readCardSrc(nodeKey)).toBe('picked')
    expect(seenTags.some((tags) => tags.includes(HISTORY_MERGE_TAG))).toBe(true)

    await undo()
    expect(cardExists(nodeKey)).toBe(false)
  })

  it('keeps an unflagged pick write a discrete undo entry (the replace path)', async () => {
    await mountHistoryAndRegistrar()
    const nodeKey = await insertWithAutoOpen()

    const { result } = renderHook(() => useCardWriter(nodeKey, isPickerWidgetNode))
    await act(async () => {
      result.current((node) => {
        node.src = 'picked'
      })
      await tick()
    })
    expect(readCardSrc(nodeKey)).toBe('picked')

    await undo()
    expect(cardExists(nodeKey)).toBe(true)
    expect(readCardSrc(nodeKey)).toBe('')

    await undo()
    expect(cardExists(nodeKey)).toBe(false)
  })
})

describe('headless purity', () => {
  it('the headless surface never references the pick seam', () => {
    const headlessFiles = readdirSync('packages/inkling/src/headless', { recursive: true })
      .filter((entry): entry is string => typeof entry === 'string' && entry.endsWith('.ts'))
      .map((entry) => `packages/inkling/src/headless/${entry}`)
    expect(headlessFiles.length).toBeGreaterThan(0)
    for (const file of headlessFiles) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(
        /useCardPicker|CardPickerHostPlugin|cardPickerStore|CardPickerStoreContext/,
      )
    }
  })
})
