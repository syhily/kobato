import type { LexicalEditor, LexicalNode } from 'lexical'
import type { ComponentType, SVGProps } from 'react'

import { createHeadlessEditor } from '@lexical/headless'
import { renderHook } from '@testing-library/react'
import { $createParagraphNode, $getRoot, createCommand, DecoratorNode } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getCardMenu } from '#/utils/card-menu'
import { mockComposerContext } from '#/utils/composer-context'
import { tick } from '#/utils/test-editor'
import { generateDecoratorNode } from '@/nodes/base/generate-decorator-node'
import { $isInklingCard, InklingDecoratorNode } from '@/nodes/base/InklingDecoratorNode'
import { resolveCardInsertCommand } from '@/nodes/cards/card-commands'
import { type CardBaseNodeClass } from '@/nodes/cards/card-declaration'
import { getCardDecorateTarget } from '@/nodes/cards/card-decorate'
import { getCardToolbarLabel } from '@/nodes/cards/card-facts'
import { getCardInsertRegistrations } from '@/nodes/cards/card-insert-commands'
import { getCardDragIcon, resolveCardIcon } from '@/nodes/cards/card-menus'
import { getRegisteredCardNodes } from '@/nodes/cards/editor-card-nodes'
import { getHostCard, getHostCards } from '@/nodes/cards/host-card-registry'
import { defineCard } from '@/nodes/cards/host-cards'
import { createCardSelectionStore } from '@/plugins/behaviour/cardSelectionStore'
import { registerCardCommands } from '@/plugins/behaviour/registerCardCommands'
import { CardInsertPlugin } from '@/plugins/CardInsertPlugin'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

const INSERT_MUSIC_PLAYER_COMMAND = createCommand('INSERT_MUSIC_PLAYER_COMMAND')

// The host card's own insert command is derived from its node type, exactly
// like a built-in card's — resolved through the same memoized resolver the
// menu projection and the insert registrar read, so all three name one object
const DERIVED_MUSIC_PLAYER_INSERT = resolveCardInsertCommand('musicPlayer')

const CustomMenuIcon: ComponentType<SVGProps<SVGSVGElement>> = () => null
const CustomDragIcon: ComponentType<SVGProps<SVGSVGElement>> = () => null
const CustomIndicatorIcon: ComponentType<SVGProps<SVGSVGElement>> = () => null

// The rich host card: menu (both icon paths, both command forms — the
// derived `'insert'` name and a raw host-defined LexicalCommand), insert
// spec, decorate target with an indicator icon, explicit drag icon.
// Registered at module top level, mirroring the host idiom (defineCard
// before any composer mounts).
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
    // the render's node is InstanceType of THIS baseNode — the declared
    // properties are typed with no narrowing (positive pin)…
    const src: string = node.src
    expect(typeof src).toBe('string')
    // @ts-expect-error …and undeclared properties are a compile error (negative pin)
    void node.bpm
    return null
  },
})

// The minimal host card: required fields only — no menu, insert, decorate
// target, or drag icon. `uploadType` reuses a media key (the only shape the
// closed upload-claiming seam allows a host card).
const hostWidget = defineCard({
  nodeType: 'hostWidget',
  baseNode: generateDecoratorNode({ nodeType: 'hostWidget' }),
  toolbarLabel: 'host-widget',
  uploadType: 'image',
  render: () => null,
})

describe('defineCard', () => {
  it('registers the card in the host registry, in registration order, with the raw spec stored verbatim', () => {
    expect(getHostCards().map((host) => host.nodeType)).toEqual(['musicPlayer', 'hostWidget'])
    // the registry is a neutral fact store: the raw spec, complete at
    // registration — the views derive every projection (including the
    // assembled class, see the insert-registration test below)
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
      // deliberately not a generateDecoratorNode product: the assertion is
      // the fixture's own marker that this input is invalid BY CONSTRUCTION
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

    // node construction needs an active editor (the constructor assigns the key)
    editor.update(() => {
      const node = new musicPlayer.node({ src: 'https://example.com/song.mp3' })
      expect(node).toBeInstanceOf(InklingDecoratorNode)
      expect($isInklingCard(node)).toBe(true)
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
    // the id path resolves through the built-in icon table; a component passes through
    expect(menu?.[0]?.Icon).toBe(resolveCardIcon('audio'))
    expect(menu?.[1]?.Icon).toBe(CustomMenuIcon)
    // the 'insert' name resolves to the card's derived insert command; a raw
    // host-defined command passes through
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
    // the minimal card carries no insert spec and drops out
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
    // built-in labels resolve from the declarations first
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
    // allow React effects to register commands
    await tick()
  }

  it('dispatches the host insert command and lands the node in the document', async () => {
    editor = createHostEditor([musicPlayer.node])
    registerCardCommands(editor, { store: createCardSelectionStore() })
    await mountRegistrar(editor)

    editor.update(() => {
      const paragraph = $createParagraphNode()
      $getRoot().append(paragraph)
      paragraph.select()
    })
    // Lexical 0.46 commits updates on a microtask — tick() drains the queue so
    // assertions see the settled state
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
