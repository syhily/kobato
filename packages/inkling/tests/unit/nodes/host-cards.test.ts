import type { NestedEditorSpec, TransientPropSpec } from '@kobato/inkling-internal/nodes/base/card-specs'
import type { ComponentType, SVGProps } from 'react'

import { generateDecoratorNode } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { $isInklingCard, InklingDecoratorNode } from '@kobato/inkling-internal/nodes/base/InklingDecoratorNode'
import { resolveCardInsertCommand } from '@kobato/inkling-internal/nodes/cards/card-commands'
import { type CardBaseNodeClass } from '@kobato/inkling-internal/nodes/cards/card-declaration'
import { getCardDecorateTarget } from '@kobato/inkling-internal/nodes/cards/card-decorate'
import { getCardToolbarLabel } from '@kobato/inkling-internal/nodes/cards/card-facts'
import { getCardInsertRegistrations } from '@kobato/inkling-internal/nodes/cards/card-insert-commands'
import { getCardDragIcon, resolveCardIcon } from '@kobato/inkling-internal/nodes/cards/card-menus'
import { getRegisteredCardNodes } from '@kobato/inkling-internal/nodes/cards/editor-card-nodes'
import { getHostCard, getHostCards } from '@kobato/inkling-internal/nodes/cards/host-card-registry'
import { defineCard } from '@kobato/inkling-internal/nodes/cards/host-cards'
import MINIMAL_NODES from '@kobato/inkling-internal/nodes/MinimalNodes'
import { createCardPickerStore } from '@kobato/inkling-internal/plugins/behaviour/card-picker-store'
import { createCardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'
import { registerCardCommands } from '@kobato/inkling-internal/plugins/behaviour/register-card-commands'
import { CardInsertPlugin } from '@kobato/inkling-internal/plugins/CardInsertPlugin'
import { getCardMenu } from '@kobato/inkling/tests/utils/card-menu'
import { mockComposerContext } from '@kobato/inkling/tests/utils/composer-context'
import { tick } from '@kobato/inkling/tests/utils/test-editor'
import { createHeadlessEditor } from '@lexical/headless'
import { renderHook } from '@testing-library/react'
import {
  $createParagraphNode,
  $getRoot,
  createCommand,
  DecoratorNode,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

const INSERT_MUSIC_PLAYER_COMMAND = createCommand('INSERT_MUSIC_PLAYER_COMMAND')

const DERIVED_MUSIC_PLAYER_INSERT = resolveCardInsertCommand('musicPlayer')
const CustomMenuIcon: ComponentType<SVGProps<SVGSVGElement>> = () => null
const CustomDragIcon: ComponentType<SVGProps<SVGSVGElement>> = () => null
const CustomIndicatorIcon: ComponentType<SVGProps<SVGSVGElement>> = () => null

const musicPlayer = defineCard({
  nodeType: 'musicPlayer',
  baseNode: generateDecoratorNode({
    nodeType: 'musicPlayer',
    properties: [{ name: 'src', default: '' }] as const,
  }),
  decorateTarget: { hasIndicatorIcon: true },
  IndicatorIcon: CustomIndicatorIcon,
  insert: {},
  menu: [
    { label: 'Music', labelKey: 'music', icon: 'audio', command: 'insert', matches: ['music'] },
    {
      label: 'Music (legacy)',
      labelKey: 'musicLegacy',
      icon: CustomMenuIcon,
      command: INSERT_MUSIC_PLAYER_COMMAND,
      matches: ['music legacy'],
    },
  ],
  dragIcon: CustomDragIcon,
  toolbarLabel: 'music-player',
  render: (node) => {
    const src: string = node.src
    expect(typeof src).toBe('string')
    // @ts-expect-error …and undeclared properties are a compile error (negative pin)
    const _bpm = node.bpm
    return null
  },
})

const hostWidget = defineCard({
  nodeType: 'hostWidget',
  baseNode: generateDecoratorNode({ nodeType: 'hostWidget' }),
  toolbarLabel: 'host-widget',
  uploadType: 'image',
  render: () => null,
})
const typedWidgetTransientProps = [
  {
    name: 'triggerFileDialog',
    initial: (dataset: Record<string, unknown>): boolean => Boolean(dataset.triggerFileDialog),
    accessor: true,
  },
] as const satisfies readonly TransientPropSpec[]

const typedWidgetNestedEditors = [
  { name: 'bodyEditor', serializedKey: 'body', nodes: MINIMAL_NODES, nullable: true },
] as const satisfies readonly NestedEditorSpec[]

const typedWidget = defineCard({
  nodeType: 'typedWidget',
  baseNode: generateDecoratorNode({
    nodeType: 'typedWidget',
    properties: [{ name: 'body', default: '' }] as const,
  }),
  transientProps: typedWidgetTransientProps,
  nestedEditors: typedWidgetNestedEditors,
  toolbarLabel: 'typed-widget',
  render: () => null,
})

describe('defineCard', () => {
  it('registers the card in the host registry, in registration order, with the raw spec stored verbatim', () => {
    expect(getHostCards().map((host) => host.nodeType)).toEqual(['musicPlayer', 'hostWidget', 'typedWidget'])

    expect(getHostCard('musicPlayer')?.spec.nodeType).toBe('musicPlayer')
    expect(getHostCard('musicPlayer')?.spec.toolbarLabel).toBe('music-player')
  })

  it('throws when the nodeType collides with a built-in card', () => {
    expect(() =>
      defineCard({
        nodeType: 'audio',
        baseNode: generateDecoratorNode({ nodeType: 'collidingBuiltin' }),
        toolbarLabel: 'audio-clone',
        render: () => null,
      }),
    ).toThrow(/already declared/)
  })

  it('throws when the nodeType collides with an already-registered host card', () => {
    expect(() =>
      defineCard({
        nodeType: 'musicPlayer',
        baseNode: generateDecoratorNode({ nodeType: 'collidingHost' }),
        toolbarLabel: 'music-clone',
        render: () => null,
      }),
    ).toThrow(/already declared/)
  })

  it('throws when the base node does not extend InklingDecoratorNode', () => {
    class NotACardNode extends DecoratorNode<null> {
      static getType() {
        return 'not-a-card'
      }

      static clone() {
        return new NotACardNode()
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
    }

    expect(() =>
      defineCard({
        nodeType: 'notACard',
        baseNode: NotACardNode as unknown as CardBaseNodeClass,
        toolbarLabel: 'not-a-card',
        render: () => null,
      }),
    ).toThrow(/InklingDecoratorNode/)
  })

  it('assembles a class whose instances pass $isInklingCard with no host-side ceremony', () => {
    const editor = createHeadlessEditor({ nodes: [musicPlayer.node], onError: () => {} })

    editor.update(() => {
      const node = new musicPlayer.node({ src: 'https://example.com/song.mp3' })
      expect(node).toBeInstanceOf(InklingDecoratorNode)
      expect($isInklingCard(node)).toBe(true)
    })
  })

  it('threads the spec type onto card.node: const-asserted spec arrays resolve typed __* fields and accessors', () => {
    const editor = createHeadlessEditor({ nodes: [typedWidget.node], onError: () => {} })

    editor.update(() => {
      const node = new typedWidget.node({ body: '<p>x</p>' })

      const bodyEditor: LexicalEditor | null = node.__bodyEditor
      const initialState: EditorState | undefined = node.__bodyEditorInitialState
      const flag: boolean = node.__triggerFileDialog
      expect(bodyEditor).not.toBeNull()
      expect(initialState).toBeUndefined()
      expect(flag).toBe(false)

      node.triggerFileDialog = true
      expect(node.__triggerFileDialog).toBe(true)

      // @ts-expect-error — no spec entry named 'missing'
      const _missing = node.__missing
      // @ts-expect-error — the entry is nullable: true, so the field is LexicalEditor | null
      const _nonNull: LexicalEditor = node.__bodyEditor
      // @ts-expect-error — the accessor value type is boolean
      node.triggerFileDialog = 'yes'
    })
  })

  it('resolves the card menu from the host registry', () => {
    expect(getCardMenu('musicPlayer')?.map((item) => item.label)).toEqual(
      getHostCard('musicPlayer')?.spec.menu?.map((item) => item.label),
    )
    expect(getCardMenu(hostWidget.nodeType)).toBeUndefined()
  })
})
describe('host cards in the derived views', () => {
  it('resolves menu entries through both icon paths and binds each entry command', () => {
    const menu = getCardMenu('musicPlayer')

    expect(menu?.map((item) => item.label)).toEqual(['Music', 'Music (legacy)'])

    expect(menu?.[0]?.Icon).toBe(resolveCardIcon('audio'))
    expect(menu?.[1]?.Icon).toBe(CustomMenuIcon)

    expect(menu?.map((item) => item.insertCommand)).toEqual([DERIVED_MUSIC_PLAYER_INSERT, INSERT_MUSIC_PLAYER_COMMAND])

    expect(getCardMenu('hostWidget')).toBeUndefined()
  })

  it('resolves the drag icon from the spec and falls back to the first menu icon', () => {
    expect(getCardDragIcon('musicPlayer')).toBe(CustomDragIcon)
    expect(getCardDragIcon('hostWidget')).toBeUndefined()
  })

  it('resolves the decorate target from the host registry, indicator icon gated by hasIndicatorIcon', () => {
    const target = getCardDecorateTarget('musicPlayer')
    expect(target?.nodeType).toBe('musicPlayer')
    expect(target?.decorateTarget).toEqual({ hasIndicatorIcon: true })
    expect(target?.IndicatorIcon).toBe(CustomIndicatorIcon)

    const minimal = getCardDecorateTarget('hostWidget')
    expect(minimal?.decorateTarget).toBeUndefined()
    expect(minimal?.IndicatorIcon).toBeUndefined()
  })

  it('projects host insert registrations after the built-in ones', () => {
    const registrations = getCardInsertRegistrations()
    const hostRegistration = registrations.find((registration) => registration.nodeType === 'musicPlayer')

    expect(hostRegistration?.node).toBe(musicPlayer.node)
    expect(hostRegistration?.command).toBe(DERIVED_MUSIC_PLAYER_INSERT)

    expect(registrations.some((registration) => registration.nodeType === 'hostWidget')).toBe(false)
  })

  it('joins getRegisteredCardNodes behind the built-in declarations, with resolved menu and upload key', () => {
    const cardNodes = getRegisteredCardNodes(new Set(['musicPlayer', 'hostWidget', 'image']))

    expect(cardNodes.map(([nodeType]) => nodeType)).toEqual(['image', 'musicPlayer', 'hostWidget'])
    const cards = new Map(cardNodes)
    expect(cards.get('musicPlayer')?.cardMenu?.[0]?.label).toBe('Music')
    expect(cards.get('musicPlayer')?.uploadType).toBeUndefined()
    expect(cards.get('hostWidget')?.cardMenu).toBeUndefined()
    expect(cards.get('hostWidget')?.uploadType).toBe('image')
  })

  it('omits host cards whose node type is not registered', () => {
    expect(getRegisteredCardNodes(new Set()).map(([nodeType]) => nodeType)).toEqual([])
    expect(getRegisteredCardNodes(new Set(['image'])).map(([nodeType]) => nodeType)).toEqual(['image'])
  })
  it('falls back to the host record for the toolbar label', () => {
    expect(getCardToolbarLabel('musicPlayer')).toBe('music-player')
    expect(getCardToolbarLabel('hostWidget')).toBe('host-widget')

    expect(getCardToolbarLabel('audio')).toBe('audio')
  })
})

describe('host card insert integration', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createHostEditor(nodes: Array<typeof musicPlayer.node>) {
    return createHeadlessEditor({ namespace: 'test', nodes, onError: () => {} })
  }

  async function mountRegistrar(target: LexicalEditor) {
    mockComposerContext(target)
    renderHook(() => CardInsertPlugin())
    await tick()
  }

  it('dispatches the host insert command and lands the node in the document', async () => {
    editor = createHostEditor([musicPlayer.node])
    registerCardCommands(editor, { store: createCardSelectionStore(), pickerStore: createCardPickerStore() })
    await mountRegistrar(editor)

    editor.update(() => {
      const paragraph = $createParagraphNode()
      $getRoot().append(paragraph)
      paragraph.select()
    })
    await tick()

    expect(editor.dispatchCommand(DERIVED_MUSIC_PLAYER_INSERT, { src: 'https://example.com/song.mp3' })).toBe(true)
    await tick()

    editor.getEditorState().read(() => {
      const inserted = $getRoot()
        .getChildren()
        .find((child: LexicalNode) => child.getType() === 'musicPlayer')
      expect(inserted).toBeDefined()
      expect($isInklingCard(inserted)).toBe(true)
    })
  })

  it('does not register the host insert command on an editor without the host node', async () => {
    editor = createHostEditor([])
    await mountRegistrar(editor)

    expect(editor.dispatchCommand(DERIVED_MUSIC_PLAYER_INSERT, { src: 'https://example.com/song.mp3' })).toBe(false)
  })
})
