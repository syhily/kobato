import type { CardNodeClass } from '@kobato/inkling-internal/nodes/assemble-card-node'
import type { NestedEditorSpec, TransientPropSpec } from '@kobato/inkling-internal/nodes/base/card-specs'
import type {
  CardBaseNodeClass,
  CardMenuDataset,
  CardMenuEntryCheck,
} from '@kobato/inkling-internal/nodes/cards/card-declaration'
import type { HostCardMenuEntrySpec, HostCardSpec } from '@kobato/inkling-internal/nodes/cards/host-card-registry'
import type { MultilineElementTransformer } from '@lexical/markdown'
import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { InklingDecoratorNode } from '@kobato/inkling-internal/nodes/base/InklingDecoratorNode'
import { CARD_DECLARATIONS } from '@kobato/inkling-internal/nodes/cards/'
import { createCardTransformer } from '@kobato/inkling-internal/nodes/cards/card-markdown-transformers'
import { hasHostCard, registerHostCard } from '@kobato/inkling-internal/nodes/cards/host-card-registry'

export type { HostCardMenuEntrySpec, HostCardSpec } from '@kobato/inkling-internal/nodes/cards/host-card-registry'

export interface HostCard<NodeType extends string = string, Spec = unknown> {
  nodeType: NodeType
  node: CardNodeClass<LexicalNode, Spec>
  markdownTransformer?: MultilineElementTransformer
}

type HostCardSpecWithParts<
  Spec,
  Transient extends readonly TransientPropSpec[],
  Nested extends readonly NestedEditorSpec[],
> = Spec & {
  transientProps?: Transient
  nestedEditors?: Nested
}
/**
 * The contextual shape of a host menu entry: every field except `queryParams`,
 * which stays `readonly unknown[]` on purpose — `unknown` gives the array literal no
 * contextual element type, so the `const Menu` capture keeps `['src']` literal; a
 * contextual `readonly string[]` would widen it and lose the key the exact check
 * needs. Cost: no autocomplete for `queryParams` elements; the exact check restores
 * type safety, not hints.
 */
type HostMenuEntryShape<Dataset extends Record<string, unknown>> = Omit<
  HostCardMenuEntrySpec<Dataset>,
  'queryParams'
> & {
  queryParams?: readonly unknown[]
}

export function defineCard<
  NodeType extends string,
  B extends CardBaseNodeClass,
  Spec extends Omit<HostCardSpec<NodeType>, 'render' | 'menu' | 'transientProps' | 'nestedEditors'>,
  Transient extends readonly TransientPropSpec[] = readonly [],
  Nested extends readonly NestedEditorSpec[] = readonly [],
  const Menu extends readonly unknown[] = readonly [],
>(
  spec: Spec & {
    nodeType: NodeType
    baseNode: B
    transientProps?: Transient
    nestedEditors?: Nested
    menu?: readonly HostMenuEntryShape<CardMenuDataset<B, Transient, Nested>>[] &
      Menu &
      CardMenuEntryCheck<Menu, CardMenuDataset<B, Transient, Nested>>
    render(node: InstanceType<B>): ReactNode
  },
): HostCard<NodeType, HostCardSpecWithParts<Spec, Transient, Nested>> {
  // $isInklingCard gates on `instanceof InklingDecoratorNode` and the exportDOM
  // contract assumes the generated machinery, so require the base to extend it.
  if (!(spec.baseNode.prototype instanceof InklingDecoratorNode)) {
    throw new TypeError(
      `[defineCard] '${spec.nodeType}': baseNode must extend InklingDecoratorNode (build it with generateDecoratorNode)`,
    )
  }
  if (CARD_DECLARATIONS.some((declaration) => declaration.nodeType === spec.nodeType) || hasHostCard(spec.nodeType)) {
    throw new Error(`[defineCard] '${spec.nodeType}': a card with this nodeType is already declared`)
  }
  const node = assembleCardNodeOnce<LexicalNode, HostCardSpecWithParts<Spec, Transient, Nested>>(spec)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- storage-only widening; the checked shape is narrower than the registry's raw entry type
  registerHostCard({ nodeType: spec.nodeType, spec: spec as HostCardSpec<NodeType> })
  const host: HostCard<NodeType, HostCardSpecWithParts<Spec, Transient, Nested>> = {
    nodeType: spec.nodeType,
    node,
  }
  if (spec.markdownFence) {
    host.markdownTransformer = createCardTransformer({ card: spec.nodeType, nodeClass: node, ...spec.markdownFence })
  }
  return host
}
