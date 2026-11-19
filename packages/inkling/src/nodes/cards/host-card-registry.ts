import type {
  CardDeclaration,
  CardIconId,
  CardMenuCommand,
  CardMenuEntrySpec,
} from '@kobato/inkling-internal/nodes/cards/card-declaration'
import type { CardFencePayload } from '@kobato/inkling-internal/nodes/cards/card-markdown-transformers'
import type { AnyLexicalCommand, LexicalEditor, LexicalNode, NodeKey } from 'lexical'
import type { ComponentType, ReactNode, SVGProps } from 'react'

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
  editor: LexicalEditor

  nodeKey: NodeKey

  close: () => void

  fromInsert?: boolean
}

export interface HostCardPickerSpec {
  render: (props: CardPickerRenderProps) => ReactNode

  autoOpenOnInsert?: boolean
}

export interface HostCardSpec<NodeType extends string = string, TNode extends LexicalNode = LexicalNode> extends Omit<
  CardDeclaration<NodeType>,
  'menu' | 'dragIcon' | 'markdown'
> {
  render(node: TNode): ReactNode
  picker?: HostCardPickerSpec
  IndicatorIcon?: ComponentType<SVGProps<SVGSVGElement>>
  menu?: readonly HostCardMenuEntrySpec[]
  dragIcon?: CardIconId | ComponentType<SVGProps<SVGSVGElement>>
  markdownFence?: CardFencePayload
}
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

export function registerHostCard(record: HostCardRecord): void {
  if (record.spec.picker !== undefined && CARD_PICKER_OVERRIDES.has(record.nodeType)) {
    throw new Error(
      `[defineCard] '${record.nodeType}': a picker override is already registered for this nodeType (one picker per card type)`,
    )
  }
  HOST_CARDS_BY_TYPE.set(record.nodeType, record)
}

const CARD_PICKER_OVERRIDES = new Map<string, HostCardPickerSpec>()

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

export function resolveCardPicker(nodeType: string): HostCardPickerSpec | undefined {
  return getHostCard(nodeType)?.spec.picker ?? CARD_PICKER_OVERRIDES.get(nodeType)
}
