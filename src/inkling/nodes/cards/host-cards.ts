import type { MultilineElementTransformer } from '@lexical/markdown'
import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

import type { CardNodeClass } from '@/inkling/nodes/assemble-card-node'
import type { NestedEditorSpec, TransientPropSpec } from '@/inkling/nodes/base/card-specs'
import type { CardBaseNodeClass, CardMenuDataset, CardMenuEntryCheck } from '@/inkling/nodes/cards/card-declaration'
import type { HostCardMenuEntrySpec, HostCardSpec } from '@/inkling/nodes/cards/host-card-registry'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { InklingDecoratorNode } from '@/inkling/nodes/base/InklingDecoratorNode'
import { CARD_DECLARATIONS } from '@/inkling/nodes/cards'
import { createCardTransformer } from '@/inkling/nodes/cards/card-markdown-transformers'
import { hasHostCard, registerHostCard } from '@/inkling/nodes/cards/host-card-registry'

// the host card vocabulary lives beside the registry that stores it; the
// barrel re-exports it from here, the public defineCard module
export type { HostCardMenuEntrySpec, HostCardSpec } from '@/inkling/nodes/cards/host-card-registry'

/**
 * The handle `defineCard` returns: the assembled node class to compose into
 * `<InklingComposer nodes>`, and the fence transformer for the markdown round-trip's
 * `cards` option when the spec carries `markdownFence`. `Spec` carries through: with
 * const-asserted arrays, `card.node`'s instance side resolves the spec-derived `__*`
 * fields and accessors — the same typing the built-in declarations get, no host-side
 * `declare` blocks.
 */
export interface HostCard<NodeType extends string = string, Spec = unknown> {
  nodeType: NodeType
  /** the assembled card class — the host composes it into `<InklingComposer nodes>` */
  node: CardNodeClass<LexicalNode, Spec>
  /** present only when the spec carries `markdownFence`; passed to the markdown round-trip's `cards` option */
  markdownTransformer?: MultilineElementTransformer
}

/**
 * The host spec's own arrays plus everything else `Spec` carries — the spec
 * type the returned handle preserves. The arrays stay OPTIONAL here: a host
 * may omit them, and the field maps resolve from whatever was inferred.
 */
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

/**
 * Declares a host card once and registers it with every derived view the built-in
 * declarations feed: the assembled node class, slash/plus menus, decorate target,
 * insert-command registrar, toolbar label, and — with `markdownFence` — the markdown
 * round-trip. Call at module top level, before the composer mounts (Lexical
 * `createCommand`'s global idiom); derived views intersect with each editor's
 * registered node types, so host cards never leak into surfaces that did not compose
 * their node class in.
 *
 * Type preservation: `Transient`/`Nested` capture the spec's own arrays, so
 * const-asserted `nestedEditors`/`transientProps` land their literal `__*` field
 * names and value types on `card.node` — a non-const inline array widens entry names
 * to `string`, degrading the field map to the loose `__${string}` pattern (never a
 * compile error).
 *
 * Menu checking: `insertParams`/`queryParams` derive their vocabulary from `B`'s
 * `getPropertyDefaults()` plus `Transient`/`Nested` (`CardMenuDataset`). On a direct
 * call, unknown `insertParams` keys (object and function forms), drifted values, and
 * non-string `queryParams` keys are compile errors. The arrays are separate type
 * parameters (rather than read off `Spec`) so the check never makes spec inference
 * circular; the `& Menu` capture preserves the caller's literal tuple, which
 * `CardMenuEntryCheck` maps against the computed dataset — without it,
 * `satisfies`/contextual typing would erase the keys first.
 *
 * Compatibility boundary:
 * - `const spec: HostCardSpec<'x'> = { … }` erases the menu's literal information:
 *   `insertParams` becomes `Record<string, unknown>`, so insert keys, insert values,
 *   and query keys are all accepted unchecked.
 * - `const spec = { … } satisfies HostCardSpec<'x'>` keeps literal `insertParams`
 *   (checked) but contextually widens `queryParams` elements to `string`; those
 *   widened query keys are accepted unchecked.
 * - A direct `defineCard({ … })` call keeps both literal forms and is fully checked.
 */
export function defineCard<
  NodeType extends string,
  B extends CardBaseNodeClass,
  // the constraint keeps `baseNode` (as the registry's CardBaseNodeClass) so
  // Spec provably satisfies CardAssemblyDeclaration; the parameter
  // intersection re-narrows it to the host's own class for InstanceType
  Spec extends Omit<HostCardSpec<NodeType>, 'render' | 'menu' | 'transientProps' | 'nestedEditors'>,
  Transient extends readonly TransientPropSpec[] = readonly [],
  Nested extends readonly NestedEditorSpec[] = readonly [],
  // `const` keeps direct-call literals (queryParams included); see the
  // `& Menu` explanation above
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
    /** the decorate render — its node is InstanceType of the host's own baseNode class (a generateDecoratorNode product carries the dataset-typed instance) */
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
  // The registry stores the raw spec: the derived views' vocabulary is looser than
  // this input-side check shape. The VALUE is untouched — identity must stay the
  // same so `assembleCardNodeOnce` and the registry share one class per spec object.
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
