import type { LexicalCommand, LexicalNode } from 'lexical'
import type { ComponentType, ReactNode, SVGProps } from 'react'

import type { CardDeclaration, CardIconId, CardMenuCommand, CardMenuEntrySpec } from '@/nodes/cards/card-declaration'
import type { CardFencePayload } from '@/nodes/cards/card-markdown-transformers'

/**
 * A host card's menu entry (CONTEXT.md: "host card"): the same shape as the
 * built-in declarations' `CardMenuEntrySpec`, except the icon may name a
 * built-in `CardIconId` or be an SVG component directly — host modules carry
 * no React-free layering constraint — and the command may additionally be a
 * raw `LexicalCommand` the host created itself (the built-in entries name
 * commands by `CardMenuCommand` string; `'insert'` works for host cards too,
 * resolving to the host card's own derived insert command). The required
 * `labelKey` matches the built-in entries; the labels table is closed, so a
 * host-defined key always falls back to the entry's own English
 * `label`/`desc` (a host localizes its own card by writing the spec text
 * directly).
 */
export type HostCardMenuEntrySpec = Omit<CardMenuEntrySpec, 'icon' | 'command'> & {
  icon: CardIconId | ComponentType<SVGProps<SVGSVGElement>>
  command: CardMenuCommand | LexicalCommand<unknown>
}

/**
 * The host card declaration (CONTEXT.md: "host card") — every
 * `CardDeclaration` field except `menu`/`dragIcon`/`markdown`, plus the
 * React half the built-in cards attach one layer up (the `render*Card`
 * exports in their `*NodeComponent` files). Both halves are declared in one
 * spec here. Build the `baseNode` with `generateDecoratorNode`
 * (`@/nodes/base/generate-decorator-node`) so the node satisfies the
 * InklingDecoratorNode contract the selection protocol and `exportDOM` gate
 * on. An `insert` spec carries no command: the host card's insert command is
 * derived from its node type (`resolveCardInsertCommand` in
 * `@/nodes/cards/card-commands`), exactly like a built-in card's.
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
 * projectors (`@/nodes/cards/card-menus`, `card-decorate`,
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
// paths, so it must never pull in the wrapper layer at runtime.
const HOST_CARDS_BY_TYPE = new Map<string, HostCardRecord>()
const HOST_CARDS: HostCardRecord[] = []

export function getHostCard(nodeType: string): HostCardRecord | undefined {
  return HOST_CARDS_BY_TYPE.get(nodeType)
}

export function getHostCards(): readonly HostCardRecord[] {
  return HOST_CARDS
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
  HOST_CARDS_BY_TYPE.set(record.nodeType, record)
  HOST_CARDS.push(record)
}
