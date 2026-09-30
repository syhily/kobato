import type { LexicalCommand, LexicalEditor, LexicalNode, NodeKey } from 'lexical'
import type { ComponentType, ReactNode, SVGProps } from 'react'

import type {
  CardDeclaration,
  CardIconId,
  CardMenuCommand,
  CardMenuEntrySpec,
} from '@/inkling/nodes/cards/card-declaration'
import type { CardFencePayload } from '@/inkling/nodes/cards/card-markdown-transformers'

/**
 * A host card's menu entry (CONTEXT.md: "host card"): the same shape as the
 * built-in declarations' `CardMenuEntrySpec`, except the icon may name a
 * built-in `CardIconId` or be an SVG component directly — host modules carry
 * no React-free layering constraint — and the command may additionally be a
 * raw `LexicalCommand` the host created itself (the built-in entries name
 * commands by `CardMenuCommand` string; `'insert'` works for host cards too,
 * resolving to the host card's own derived insert command). The required
 * `labelKey` matches the built-in entries' shape, but the shipped labels
 * table is closed to host keys: a host entry names its key `host.<name>`
 * and localizes through the `menu.host.*` namespace in the
 * `<InklingComposer labels={...}>` override channel
 * (`InklingHostMenuLabelKey`), with the entry's own `label`/`desc` as the
 * fallback when the namespace carries no override.
 */
export type HostCardMenuEntrySpec = Omit<CardMenuEntrySpec, 'icon' | 'command'> & {
  icon: CardIconId | ComponentType<SVGProps<SVGSVGElement>>
  command: CardMenuCommand | LexicalCommand<unknown>
}

/**
 * The props a host card's picker render receives (CONTEXT.md: "pick seam").
 * `nodeKey` — not the node instance — crosses the boundary: pick writes
 * resolve the latest instance by key inside `editor.update()` (the generated
 * setters' getWritable does the same), so a render that outlives an edit
 * never touches a detached node (Lexical #195). `close` dismisses the picker
 * without picking. The render is called by the picker host plugin inside the
 * composer tree — return an element (hooks live on that element's component),
 * never call hooks in the render body itself.
 */
export interface CardPickerRenderProps {
  /** the top-level editor the card lives in */
  editor: LexicalEditor
  /** the card node the pick targets */
  nodeKey: NodeKey
  /** dismiss the picker without picking */
  close: () => void
}

/**
 * An entity-backed host card's picker (CONTEXT.md: "entity-backed card",
 * "pick seam"): the host-owned dialog that resolves the card's entity (a
 * library row, an upload, …) onto the node dataset. The card component opens
 * it through `useCardPicker()`; the picker host plugin
 * (`@/inkling/plugins/CardPickerHostPlugin`, a core entry) renders
 * `picker.render(...)` for the active request. With `autoOpenOnInsert`, the
 * insert registrar opens the picker on the freshly inserted node — the
 * insert-command channel only, so editor-state loads never trigger it.
 */
export interface HostCardPickerSpec {
  render: (props: CardPickerRenderProps) => ReactNode
  /** open the picker immediately when an insert command creates the card */
  autoOpenOnInsert?: boolean
}

/**
 * The host card declaration (CONTEXT.md: "host card") — every
 * `CardDeclaration` field except `menu`/`dragIcon`/`markdown`, plus the
 * React half the built-in cards attach one layer up (the `render*Card`
 * exports in their `*NodeComponent` files). Both halves are declared in one
 * spec here. Build the `baseNode` with `generateDecoratorNode`
 * (`@/inkling/nodes/base/generate-decorator-node`) so the node satisfies the
 * InklingDecoratorNode contract the selection protocol and `exportDOM` gate
 * on. An `insert` spec carries no command: the host card's insert command is
 * derived from its node type (`resolveCardInsertCommand` in
 * `@/inkling/nodes/cards/card-commands`), exactly like a built-in card's.
 */
export interface HostCardSpec<NodeType extends string = string, TNode extends LexicalNode = LexicalNode> extends Omit<
  CardDeclaration<NodeType>,
  'menu' | 'dragIcon' | 'markdown'
> {
  /**
   * the decorate render — the built-in cards' `render*Card` counterpart.
   * defineCard types the node as InstanceType<typeof spec.baseNode>, so a
   * generateDecoratorNode-built class checks the render body against the
   * host's own declared properties (the internal pipeline's discipline —
   * no narrowing cast); name the second type argument to pin it explicitly.
   */
  render(node: TNode): ReactNode
  /**
   * The card's picker (CONTEXT.md: "pick seam") — see `HostCardPickerSpec`.
   * Only host cards carry one: the built-in cards' editing chrome is
   * layer-internal, while a host's entity dialog lives in host code.
   */
  picker?: HostCardPickerSpec
  IndicatorIcon?: ComponentType<SVGProps<SVGSVGElement>>
  menu?: readonly HostCardMenuEntrySpec[]
  dragIcon?: CardIconId | ComponentType<SVGProps<SVGSVGElement>>
  /** carrying a fence payload opts the card into the markdown round-trip; the vocabulary matches the built-in `CARD_FENCE_PAYLOADS` */
  markdownFence?: CardFencePayload
}

/**
 * One registered host card (CONTEXT.md: "host card") as registry facts: the
 * raw spec, stored verbatim. The registry is a neutral fact store — every
 * derived view projects its own shape off the spec through the shared
 * projectors (`@/inkling/nodes/cards/card-menus`, `card-decorate`,
 * `card-insert-commands`), so no view-shaped fact is pre-resolved here and
 * the record is complete the moment it is stored (the assembled node class
 * never rides the record; the views derive it through the memoized
 * assembler).
 */
export interface HostCardRecord {
  nodeType: string
  spec: HostCardSpec
}

// Module-level registry, mirroring Lexical `createCommand`'s global idiom:
// hosts call `defineCard` at module top level, before their composer mounts.
// Kept in its own module with a type-only import closure — the derived views
// (card-menus, card-decorate, …) read it from inside module-init assembly
// paths, so it must never pull in the wrapper layer at runtime. The Map IS
// the ordered store (insertion order is specified), so no parallel array is
// kept in lockstep.
const HOST_CARDS_BY_TYPE = new Map<string, HostCardRecord>()

export function getHostCard(nodeType: string): HostCardRecord | undefined {
  return HOST_CARDS_BY_TYPE.get(nodeType)
}

export function getHostCards(): readonly HostCardRecord[] {
  return [...HOST_CARDS_BY_TYPE.values()]
}

export function hasHostCard(nodeType: string): boolean {
  return HOST_CARDS_BY_TYPE.has(nodeType)
}

/**
 * Registers the record `defineCard` built — the raw host spec, stored once
 * and complete (no post-registration patching; the views derive every
 * projection, including the assembled node class, from the spec).
 */
export function registerHostCard(record: HostCardRecord): void {
  if (record.spec.picker !== undefined && CARD_PICKER_OVERRIDES.has(record.nodeType)) {
    throw new Error(
      `[defineCard] '${record.nodeType}': a picker override is already registered for this nodeType (one picker per card type)`,
    )
  }
  HOST_CARDS_BY_TYPE.set(record.nodeType, record)
}

// The picker override map (CONTEXT.md: "pick seam"): picker facts for cards
// that CANNOT carry a HostCardSpec — a same-type variant of a built-in card
// (kobato's KobatoImageNode replaces the stock class for node type 'image';
// defineCard hard-rejects the collision). Same raw-fact philosophy as the
// host store above: the seam resolves through `resolveCardPicker`, never by
// reading this map directly. Registration order is unobservable (one picker
// per nodeType, enforced at registration), so the Map is a plain fact table.
const CARD_PICKER_OVERRIDES = new Map<string, HostCardPickerSpec>()

/**
 * Registers a picker for a card type without a host card spec (the built-in
 * variant channel — see the map's comment). Throws when the type already has
 * a picker from either channel: one picker per node type.
 */
export function registerCardPicker(nodeType: string, picker: HostCardPickerSpec): void {
  if (CARD_PICKER_OVERRIDES.has(nodeType) || getHostCard(nodeType)?.spec.picker !== undefined) {
    throw new Error(`[registerCardPicker] '${nodeType}': a picker is already registered for this nodeType`)
  }
  CARD_PICKER_OVERRIDES.set(nodeType, picker)
}

/**
 * The card type's picker from EITHER channel: the host spec's `picker` fact
 * first, then the variant override. The pick seam's dispatch (`useCardPicker`,
 * `CardPickerHostPlugin`) resolves through here, so the two channels share
 * one dispatch path.
 */
export function resolveCardPicker(nodeType: string): HostCardPickerSpec | undefined {
  return getHostCard(nodeType)?.spec.picker ?? CARD_PICKER_OVERRIDES.get(nodeType)
}
