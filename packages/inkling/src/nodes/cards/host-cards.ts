import type { MultilineElementTransformer } from '@lexical/markdown'
import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

import type { CardNodeClass } from '@/nodes/assemble-card-node'
import type { CardBaseNodeClass } from '@/nodes/cards/card-declaration'
import type { HostCardSpec } from '@/nodes/cards/host-card-registry'

import { assembleCardNodeOnce } from '@/nodes/assemble-card-node'
import { InklingDecoratorNode } from '@/nodes/base/InklingDecoratorNode'
import { CARD_DECLARATIONS } from '@/nodes/cards'
import { createCardTransformer } from '@/nodes/cards/card-markdown-transformers'
import { hasHostCard, registerHostCard } from '@/nodes/cards/host-card-registry'

// the host card vocabulary lives beside the registry that stores it; the
// barrel re-exports it from here, the public defineCard module
export type { HostCardMenuEntrySpec, HostCardSpec } from '@/nodes/cards/host-card-registry'

/**
 * The handle `defineCard` returns: the assembled node class to compose into
 * `<InklingComposer nodes>`, and the fence transformer to pass to the
 * markdown round-trip's `cards` option when the spec carries `markdownFence`.
 */
export interface HostCard<NodeType extends string = string> {
  nodeType: NodeType
  /** the assembled card class — the host composes it into `<InklingComposer nodes>` */
  node: CardNodeClass<LexicalNode>
  /** present only when the spec carries `markdownFence`; passed to the markdown round-trip's `cards` option */
  markdownTransformer?: MultilineElementTransformer
}

/**
 * Declares a host card once and registers it with every derived view the
 * built-in declarations feed (CONTEXT.md: "host card"): the assembled node
 * class, the slash/plus menus, the decorate target, the insert-command
 * registrar, the toolbar label, and — with `markdownFence` — the markdown
 * round-trip. Call it at module top level, before the composer mounts
 * (mirroring Lexical `createCommand`'s global idiom); the derived views
 * intersect with each editor's registered node types, so host cards never
 * leak into surfaces that did not compose their node class in.
 *
 * The registry stores the raw spec; every projection (menu entries, drag
 * icon, decorate target, insert registration, upload type, toolbar label)
 * is derived by the views through the same projectors the built-in
 * declarations flow through.
 */
export function defineCard<NodeType extends string, B extends CardBaseNodeClass>(
  spec: Omit<HostCardSpec<NodeType>, 'baseNode' | 'render'> & {
    baseNode: B
    /** the decorate render — its node is InstanceType of YOUR baseNode class (a generateDecoratorNode product carries the dataset-typed instance) */
    render(node: InstanceType<B>): ReactNode
  },
): HostCard<NodeType> {
  // $isInklingCard gates on `instanceof InklingDecoratorNode` and the
  // exportDOM contract assumes the generated machinery — the honest boundary
  // is to require the base to extend it (build bases with
  // generateDecoratorNode).
  if (!(spec.baseNode.prototype instanceof InklingDecoratorNode)) {
    throw new Error(
      `[defineCard] '${spec.nodeType}': baseNode must extend InklingDecoratorNode (build it with generateDecoratorNode)`,
    )
  }

  if (CARD_DECLARATIONS.some((declaration) => declaration.nodeType === spec.nodeType) || hasHostCard(spec.nodeType)) {
    throw new Error(`[defineCard] '${spec.nodeType}': a card with this nodeType is already declared`)
  }

  const node = assembleCardNodeOnce<LexicalNode>(spec)
  registerHostCard({ nodeType: spec.nodeType, spec })

  const host: HostCard<NodeType> = { nodeType: spec.nodeType, node }
  if (spec.markdownFence) {
    host.markdownTransformer = createCardTransformer({ card: spec.nodeType, nodeClass: node, ...spec.markdownFence })
  }
  return host
}
