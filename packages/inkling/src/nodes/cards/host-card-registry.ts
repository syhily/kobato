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
  if (CARD_PICKER_OVERRIDES.has(nodeType) || getHostCard(nodeType)?.spec.picker !== undefined) {
    throw new Error(`[registerCardPicker] '${nodeType}': a picker is already registered for this nodeType`)
  }
  CARD_PICKER_OVERRIDES.set(nodeType, picker)
}

export function resolveCardPicker(nodeType: string): HostCardPickerSpec | undefined {
  return getHostCard(nodeType)?.spec.picker ?? CARD_PICKER_OVERRIDES.get(nodeType)
}
