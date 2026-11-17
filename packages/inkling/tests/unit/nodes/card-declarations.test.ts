import { createHeadlessEditor } from '@lexical/headless'
import { createCommand } from 'lexical'
import { describe, expect, it } from 'vitest'

import { DEFAULT_LABELS } from '../../../src/labels/inkling-labels'
import { AudioNode } from '../../../src/nodes/AudioNode'
import { generateDecoratorNode } from '../../../src/nodes/base/generate-decorator-node'
import { BookmarkNode } from '../../../src/nodes/BookmarkNode'
import { ButtonNode } from '../../../src/nodes/ButtonNode'
import { CalloutNode } from '../../../src/nodes/CalloutNode'
import { CARD_DECLARATIONS, type AnyCardDeclaration, type CardNodeType } from '../../../src/nodes/cards'
import { resolveCardInsertCommand, resolveCardMenuCommand } from '../../../src/nodes/cards/card-commands'
import { CARD_DECORATE_TARGETS, getCardDecorateTarget } from '../../../src/nodes/cards/card-decorate'
import { getCardToolbarLabel } from '../../../src/nodes/cards/card-facts'
import { CARD_INSERT_COMMANDS, getCardInsertRegistrations } from '../../../src/nodes/cards/card-insert-commands'
import { getCardDragIcon } from '../../../src/nodes/cards/card-menus'
import { CARD_WRAPPER_NODES } from '../../../src/nodes/cards/card-wrappers'
import { defineCard } from '../../../src/nodes/cards/host-cards'
import { CodeBlockNode } from '../../../src/nodes/CodeBlockNode'
import { FileNode } from '../../../src/nodes/FileNode'
import { FootnoteDefinitionNode } from '../../../src/nodes/FootnoteDefinitionNode'
import { GalleryNode } from '../../../src/nodes/GalleryNode'
import { HeaderNode } from '../../../src/nodes/HeaderNode'
import { HorizontalRuleNode } from '../../../src/nodes/HorizontalRuleNode'
import { HtmlNode } from '../../../src/nodes/HtmlNode'
import { ImageNode } from '../../../src/nodes/ImageNode'
import { MathNode } from '../../../src/nodes/MathNode'
import { TABLE_MENU_SOURCE } from '../../../src/nodes/table/table-menu'
import { ToggleNode } from '../../../src/nodes/ToggleNode'
import { VideoNode } from '../../../src/nodes/VideoNode'
import { getCardMenu } from '../../utils/card-menu'

// The card declaration is the single per-card source of truth: these tests
// pin the declarations themselves and that every registry is derived from
// them, rather than pinning the derived wiring twice.

/**
 * Constructs every registered card class with an empty dataset inside one
 * headless-editor update (node construction requires an active editor) and
 * collects one value per card, keyed by node type.
 */
function collectFromConstructedCards<T>(
  collect: (node: InstanceType<(typeof CARD_WRAPPER_NODES)[number]['node']>) => T,
): Map<string, T> {
  const editor = createHeadlessEditor({ nodes: CARD_WRAPPER_NODES.map((card) => card.node), onError: () => {} })
  const collected = new Map<string, T>()
  editor.update(() => {
    for (const card of CARD_WRAPPER_NODES) {
      collected.set(card.nodeType, collect(new card.node({})))
    }
  })
  return collected
}

describe('card declarations as the single source of truth', () => {
  it('pairs every declaration with a wrapper node class', () => {
    expect(CARD_WRAPPER_NODES.map((card) => card.nodeType)).toEqual(CARD_DECLARATIONS.map((card) => card.nodeType))
    for (const card of CARD_WRAPPER_NODES) {
      expect(typeof card.node).toBe('function')
    }
  })

  it('pairs every declaration with a decorate render', () => {
    expect(CARD_DECORATE_TARGETS.map((target) => target.nodeType)).toEqual(
      CARD_DECLARATIONS.map((card) => card.nodeType),
    )
    for (const target of CARD_DECORATE_TARGETS) {
      expect(typeof target.render).toBe('function')
    }
  })

  it('derives the insert command from the declaration node type', () => {
    const insertNodeTypes = CARD_DECLARATIONS.filter((card) => 'insert' in card && card.insert !== undefined).map(
      (card) => card.nodeType,
    )

    // every insert-bearing declaration joins exactly one insert command,
    // derived from its node type — the spec carries only flags, so a
    // registration can never drift from the card it inserts
    expect(CARD_INSERT_COMMANDS.map((registration) => registration.nodeType).sort()).toEqual(insertNodeTypes.sort())
    for (const registration of CARD_INSERT_COMMANDS) {
      expect(registration.command).toBe(resolveCardInsertCommand(registration.nodeType))
    }
  })

  it('derives each card menu from the declaration menu spec', () => {
    for (const declaration of CARD_DECLARATIONS) {
      const menu = 'menu' in declaration ? declaration.menu : undefined
      const resolved = getCardMenu(declaration.nodeType)

      if (!menu) {
        // the footnote definition is the one menu-less card — created/ordered
        // by the footnote behaviour module, never inserted from the menu
        expect(declaration.nodeType).toBe('footnotedefinition')
        expect(resolved).toBeUndefined()
        continue
      }

      expect(resolved?.map((item) => item.label)).toEqual(menu.map((entry) => entry.label))
      // each resolved entry dispatches the command its spec entry NAMES —
      // the string resolves through the same card-commands view the registrar
      // reads, so menu dispatch and registration name one object
      expect(resolved?.map((item) => item.insertCommand)).toEqual(
        menu.map((entry) => resolveCardMenuCommand(entry.command, declaration.nodeType)),
      )
      // and the icon id resolved to a component
      for (const item of resolved ?? []) {
        expect(typeof item.Icon).toBe('function')
      }
    }
  })

  it('resolves every menu entry labelKey against the labels table (C7)', () => {
    // the declaration carries the English default; the labels table carries
    // the same text as the overridable default — a labelKey without a table
    // entry (or a stale table entry) fails here, not at render time
    for (const declaration of CARD_DECLARATIONS) {
      const menu = 'menu' in declaration ? declaration.menu : undefined
      for (const entry of menu ?? []) {
        expect(DEFAULT_LABELS[`menu.${entry.labelKey}.label` as keyof typeof DEFAULT_LABELS]).toBe(entry.label)
        if (entry.desc !== undefined) {
          expect(DEFAULT_LABELS[`menu.${entry.labelKey}.desc` as keyof typeof DEFAULT_LABELS]).toBe(entry.desc)
        }
      }
    }
    // the table pseudo-source is not a declaration but resolves the same way
    const tableMenu = TABLE_MENU_SOURCE[1].cardMenu
    const tableEntry = Array.isArray(tableMenu) ? tableMenu[0] : tableMenu
    expect(DEFAULT_LABELS[`menu.${tableEntry?.labelKey}.label` as keyof typeof DEFAULT_LABELS]).toBe(tableEntry?.label)
    expect(DEFAULT_LABELS[`menu.${tableEntry?.labelKey}.desc` as keyof typeof DEFAULT_LABELS]).toBe(tableEntry?.desc)
  })

  it('carries no menu.* labels-table key without a menu entry naming it (and vice versa)', () => {
    // the reverse direction of the resolution leg above: the labels table is
    // closed, so a stale `menu.*` key whose labelKey no declaration (or the
    // table pseudo-source) names is drift, and a new menu entry without its
    // table entry fails the resolution leg above
    const declaredLabelKeys = new Set<string>()
    for (const declaration of CARD_DECLARATIONS) {
      const menu = 'menu' in declaration ? declaration.menu : undefined
      for (const entry of menu ?? []) {
        declaredLabelKeys.add(entry.labelKey)
      }
    }
    declaredLabelKeys.add('table')

    const tableLabelKeys = new Set(
      Object.keys(DEFAULT_LABELS)
        .filter((key) => key.startsWith('menu.') && !key.startsWith('menu.section.'))
        .map((key) => /^menu\.([^.]+)\.(label|desc)$/.exec(key)?.[1]),
    )

    expect(tableLabelKeys).toEqual(declaredLabelKeys)
  })

  it('resolves a drag icon for every draggable card', () => {
    for (const declaration of CARD_DECLARATIONS) {
      // the footnote definition is menu-less and names no dragIcon — it lives
      // in the doc-end run and the run-invariant transform re-parks it anyway
      if (declaration.nodeType === 'footnotedefinition') {
        expect(getCardDragIcon(declaration.nodeType)).toBeUndefined()
        continue
      }
      expect(typeof getCardDragIcon(declaration.nodeType)).toBe('function')
    }
  })

  it('registers the same assembled class each shim exports', () => {
    // one class object per card: every shim re-exports the memoized
    // `assembleCardNodeOnce` product, so the registry entries and the
    // shim-exported classes are identical and importDOM/clone identity is
    // coherent across every consumer
    const SHIM_CLASSES = {
      audio: AudioNode,
      bookmark: BookmarkNode,
      button: ButtonNode,
      callout: CalloutNode,
      codeblock: CodeBlockNode,
      file: FileNode,
      footnotedefinition: FootnoteDefinitionNode,
      gallery: GalleryNode,
      header: HeaderNode,
      horizontalrule: HorizontalRuleNode,
      html: HtmlNode,
      image: ImageNode,
      math: MathNode,
      toggle: ToggleNode,
      video: VideoNode,
    } satisfies Record<CardNodeType, unknown>
    for (const card of CARD_WRAPPER_NODES) {
      expect(card.node).toBe(SHIM_CLASSES[card.nodeType])
    }
  })

  it('exposes exactly the getDataset keys its declaration spec names', () => {
    const datasetsByCard = collectFromConstructedCards((node) => node.getDataset())
    for (const card of CARD_WRAPPER_NODES) {
      const declaration: AnyCardDeclaration | undefined = CARD_DECLARATIONS.find(
        (entry) => entry.nodeType === card.nodeType,
      )
      const dataset = datasetsByCard.get(card.nodeType) ?? {}
      for (const spec of declaration?.transientProps ?? []) {
        if (spec.datasetKey) {
          expect(dataset, `${card.nodeType} transient ${spec.name}`).toHaveProperty(spec.datasetKey)
        } else {
          expect(dataset, `${card.nodeType} transient ${spec.name}`).not.toHaveProperty(spec.name)
        }
      }
      for (const spec of declaration?.nestedEditors ?? []) {
        expect(dataset, card.nodeType).toHaveProperty(spec.name)
        if (spec.exposeInitialStateInDataset === false) {
          expect(dataset, card.nodeType).not.toHaveProperty(`${spec.name}InitialState`)
        } else {
          expect(dataset, card.nodeType).toHaveProperty(`${spec.name}InitialState`)
        }
      }
    }
  })
})

// Regression: with a host card registered, every built-in derived view keeps
// answering from the built-in declarations — the host registry is a fallback,
// never an override.
describe('built-in derived views with a host card present', () => {
  const REGRESSION_PROBE_COMMAND = createCommand('REGRESSION_PROBE_COMMAND')

  const probe = defineCard({
    nodeType: 'regressionProbe',
    baseNode: generateDecoratorNode({ nodeType: 'regressionProbe' }),
    transientProps: [{ name: 'probeFlag' }],
    menu: [{ label: 'Probe', labelKey: 'probe', icon: 'audio', command: REGRESSION_PROBE_COMMAND, matches: ['probe'] }],
    toolbarLabel: 'regression-probe',
    render: () => null,
  })

  it('keeps the built-in registry projections untouched', () => {
    expect(CARD_WRAPPER_NODES.map((card) => card.nodeType)).toEqual(CARD_DECLARATIONS.map((card) => card.nodeType))
    expect(CARD_DECORATE_TARGETS.map((target) => target.nodeType)).toEqual(
      CARD_DECLARATIONS.map((card) => card.nodeType),
    )
    expect(CARD_INSERT_COMMANDS.map((registration) => registration.nodeType).sort()).toEqual(
      CARD_DECLARATIONS.filter((card) => 'insert' in card && card.insert !== undefined)
        .map((card) => card.nodeType)
        .sort(),
    )
  })

  it('keeps resolving built-in facts from the declarations', () => {
    expect(getCardMenu('audio')?.[0]?.label).toBe('Audio')
    expect(typeof getCardDragIcon('audio')).toBe('function')
    expect(getCardDecorateTarget('audio')?.nodeType).toBe('audio')
    expect(getCardToolbarLabel('audio')).toBe('audio')
    // the host card's facts land only in the opened fallback views
    expect(getCardMenu('regressionProbe')?.[0]?.label).toBe('Probe')
    expect(getCardToolbarLabel('regressionProbe')).toBe('regression-probe')
    expect(getCardInsertRegistrations().some((registration) => registration.nodeType === 'audio')).toBe(true)
  })

  it('adopts the host card spec on the assembled class', () => {
    // the same spec-adoption path the built-in cards run: the assembled host
    // class initializes the transient fields its spec names
    const editor = createHeadlessEditor({ nodes: [probe.node], onError: () => {} })
    editor.update(() => {
      const node = new probe.node({})
      expect(node).toHaveProperty('__probeFlag')
      const dataset = node.getDataset()
      expect(dataset).not.toHaveProperty('probeFlag')
    })
  })
})
