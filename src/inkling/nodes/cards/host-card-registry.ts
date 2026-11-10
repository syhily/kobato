import type { AnyLexicalCommand, LexicalEditor, LexicalNode, NodeKey } from 'lexical'
import type { ComponentType, ReactNode, SVGProps } from 'react'

import type {
  CardDeclaration,
  CardIconId,
  CardMenuCommand,
  CardMenuEntrySpec,
} from '@/inkling/nodes/cards/card-declaration'
import type { CardFencePayload } from '@/inkling/nodes/cards/card-markdown-transformers'

/**
 * A host card's menu entry: the built-in `CardMenuEntrySpec` shape, except the icon
 * may be a `CardIconId` or an SVG component directly (host modules carry no
 * React-free layering constraint), and the command may additionally be a raw
 * `LexicalCommand` (`'insert'` still resolves to the host card's derived insert
 * command). A host entry names its label key `host.<name>` and localizes through the
 * `menu.host.*` namespace in the `<InklingComposer labels={...}>` override channel,
 * with the entry's own `label`/`desc` as fallback.
 */
export type HostCardMenuEntrySpec<Dataset extends Record<string, unknown> = Record<string, unknown>> = Omit<
  CardMenuEntrySpec<Dataset>,
  'icon' | 'command'
> & {
  icon: CardIconId | ComponentType<SVGProps<SVGSVGElement>>
  command: CardMenuCommand | AnyLexicalCommand
}

/**
 * The props a host card's picker render receives. `nodeKey` — not the node instance —
 * crosses the boundary: pick writes resolve the latest instance by key inside
 * `editor.update()`, so a render that outlives an edit never touches a detached node
 * (Lexical #195). `fromInsert` is true when the request rode the insert command:
 * merge the pick write into the insert's undo entry (`mergeHistory`) so one undo
 * retracts both; a replace write on a resolved card stays a discrete undo entry.
 * The render runs inside the composer tree — return an element (hooks live on that
 * element's component), never call hooks in the render body.
 */
export interface CardPickerRenderProps {
  /** the top-level editor the card lives in */
  editor: LexicalEditor
  /** the card node the pick targets */
  nodeKey: NodeKey
  /** dismiss the picker without picking */
  close: () => void
  /** the request rode the insert command — merge the pick write into the insert's undo entry */
  fromInsert?: boolean
}

/**
 * An entity-backed host card's picker: the host-owned dialog that resolves the card's
 * entity (a library row, an upload, …) onto the node dataset. The card component opens
 * it through `useCardPicker()`; `CardPickerHostPlugin` renders `picker.render(...)` for
 * the active request. With `autoOpenOnInsert`, the insert registrar opens the picker on
 * the freshly inserted node — insert-command channel only, so editor-state loads never
 * trigger it.
 */
export interface HostCardPickerSpec {
  render: (props: CardPickerRenderProps) => ReactNode
  /**
   * open the picker immediately when an insert command creates the card.
   * Host-spec channel only (defineCard): the variant channel (`registerCardPicker`)
   * rejects it — a variant's inserts ride the built-in insert registration, which
   * never projects the flag, so the host dispatches its insert with `openPicker: true`
   * from its own intent command instead.
   */
  autoOpenOnInsert?: boolean
}

/**
 * The host card declaration — every `CardDeclaration` field except
 * `menu`/`dragIcon`/`markdown`, plus the React half the built-in cards attach one
 * layer up (the `render*Card` exports in their `*NodeComponent` files). Build the
 * `baseNode` with `generateDecoratorNode` so the node satisfies the
 * InklingDecoratorNode contract the selection protocol and `exportDOM` gate on. An
 * `insert` spec carries no command — it derives from the node type
 * (`resolveCardInsertCommand`), exactly like a built-in card's.
 */
export interface HostCardSpec<NodeType extends string = string, TNode extends LexicalNode = LexicalNode> extends Omit<
  CardDeclaration<NodeType>,
  'menu' | 'dragIcon' | 'markdown'
> {
  /**
   * the decorate render — the built-in cards' `render*Card` counterpart.
   * defineCard types the node as InstanceType<typeof spec.baseNode>, so a
   * generateDecoratorNode-built class checks the render body against the host's own
   * declared properties (no narrowing cast); name the second type argument to pin it.
   */
  render(node: TNode): ReactNode
  /**
   * The card's picker — see `HostCardPickerSpec`. Only host cards carry one: the
   * built-in cards' editing chrome is layer-internal, while a host's entity dialog
   * lives in host code.
   */
  picker?: HostCardPickerSpec
  IndicatorIcon?: ComponentType<SVGProps<SVGSVGElement>>
  menu?: readonly HostCardMenuEntrySpec[]
  dragIcon?: CardIconId | ComponentType<SVGProps<SVGSVGElement>>
  /** carrying a fence payload opts the card into the markdown round-trip; the vocabulary matches the built-in `CARD_FENCE_PAYLOADS` */
  markdownFence?: CardFencePayload
}

/**
 * One registered host card as registry facts: the raw spec, stored verbatim. The
 * registry is a neutral fact store — every derived view projects its own shape off
 * the spec, so no view-shaped fact is pre-resolved here. The assembled node class
 * never rides the record; views derive it through the memoized assembler.
 */
export interface HostCardRecord {
  nodeType: string
  spec: HostCardSpec
}

// Module-level registry, mirroring Lexical `createCommand`'s global idiom: hosts
// call `defineCard` at module top level, before their composer mounts. Kept in its
// own module with a type-only import closure — derived views read it inside
// module-init assembly paths, so it must never pull in the wrapper layer at
// runtime. The Map is the ordered store (insertion order is specified).
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
 * Registers the record `defineCard` built — the raw spec, stored once and complete;
 * views derive every projection (including the assembled node class) from it.
 */
export function registerHostCard(record: HostCardRecord): void {
  if (record.spec.picker !== undefined && CARD_PICKER_OVERRIDES.has(record.nodeType)) {
    throw new Error(
      `[defineCard] '${record.nodeType}': a picker override is already registered for this nodeType (one picker per card type)`,
    )
  }
  HOST_CARDS_BY_TYPE.set(record.nodeType, record)
}

// Picker facts for cards that CANNOT carry a HostCardSpec — a same-type variant of
// a built-in card (defineCard hard-rejects the collision). Resolves only through
// `resolveCardPicker`. One picker per nodeType (enforced at registration), so
// registration order is unobservable.
const CARD_PICKER_OVERRIDES = new Map<string, HostCardPickerSpec>()

/**
 * Registers a picker for a card type without a host card spec (the variant channel).
 * Throws when the type already has a picker from either channel — one picker per node
 * type — and on `autoOpenOnInsert` (host-spec-only; the flag would compile, register,
 * and never fire).
 */
export function registerCardPicker(nodeType: string, picker: HostCardPickerSpec): void {
  if (picker.autoOpenOnInsert === true) {
    throw new Error(
      `[registerCardPicker] '${nodeType}': autoOpenOnInsert is host-spec-only — variant inserts ride the built-in insert registration, which never projects the flag. Dispatch the insert with openPicker: true from the host's own intent command instead (the OPEN_IMAGE_LIBRARY_COMMAND idiom)`,
    )
  }
  if (CARD_PICKER_OVERRIDES.has(nodeType) || getHostCard(nodeType)?.spec.picker !== undefined) {
    throw new Error(`[registerCardPicker] '${nodeType}': a picker is already registered for this nodeType`)
  }
  CARD_PICKER_OVERRIDES.set(nodeType, picker)
}

/**
 * The card type's picker from either channel: the host spec's `picker` fact first,
 * then the variant override. The pick seam's dispatch resolves through here, so the
 * two channels share one dispatch path.
 */
export function resolveCardPicker(nodeType: string): HostCardPickerSpec | undefined {
  return getHostCard(nodeType)?.spec.picker ?? CARD_PICKER_OVERRIDES.get(nodeType)
}
