import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

import type {
  CardSpecAccessorMap,
  CardSpecFieldMap,
  NestedEditorSpec,
  TransientPropSpec,
} from '@/nodes/base/card-specs'
import type { CardImportSpec } from '@/nodes/base/import-spec'
import type { CardDeclaration } from '@/nodes/cards/card-declaration'

import { ensureLexicalNodeOwnMethods } from '@/nodes/base/ensure-node-own-methods'
import { decorateCard } from '@/nodes/decorate-card'

/**
 * The class type `assembleCardNode` returns: the declaration's base node
 * class with the spec statics adopted (`nestedEditors`/`transientProps`)
 * and `decorate()` added, and the declaration's spec-derived `__*` field
 * map folded into the instance side — so a shim's `InstanceType` already
 * carries the full transient/nested-editor vocabulary and needs no
 * hand-written map or cast. TypeScript can't see statics inherited
 * through a class-expression base, so the Lexical static side is spelled out
 * via the mapped type — at runtime every member here is genuinely present on
 * the assembled class. The static side deliberately carries no extra
 * construct signature (a `KlassConstructor` intersection): `InstanceType`
 * over one folds `LexicalNode`'s construct return into the instance type
 * first, degrading the base node's method types (e.g. `exportJSON()`
 * collapsing to `SerializedLexicalNode`).
 */
export type CardNodeClass<TNode extends LexicalNode, D = unknown> = {
  [k in keyof typeof LexicalNode]: (typeof LexicalNode)[k]
} & {
  // oxlint-disable-next-line typescript/no-explicit-any
  new (...args: any[]): TNode & { decorate(): ReactNode } & CardSpecFieldMap<D> &
    CardSpecAccessorMap<D> & {
      // inherited from the generateDecoratorNode base the assembled class
      // extends (getDataset is an instance member, the statics below class-side)
      getDataset(): Record<string, unknown>
    }
  prototype: TNode & { decorate(): ReactNode } & CardSpecFieldMap<D> &
    CardSpecAccessorMap<D> & {
      getDataset(): Record<string, unknown>
    }
  readonly nestedEditors: readonly NestedEditorSpec[] | undefined
  readonly transientProps: readonly TransientPropSpec[] | undefined
  getPropertyDefaults(): Record<string, unknown>
  readonly importSpec?: CardImportSpec
  readonly urlTransformMap: Record<string, string | Record<string, string>>
}

/**
 * The declaration facts assembly actually reads: the node type (the menu
 * lookup key), the React-free base class, and the two spec statics adopted
 * on the assembled class. The menu/dragIcon/markdown declaration entries
 * feed the derived views, not assembly — host card specs
 * (`@/nodes/cards/host-cards`) satisfy this shape too, so `defineCard`
 * assembles through the same memoized path.
 */
export type CardAssemblyDeclaration = Pick<
  CardDeclaration,
  'nodeType' | 'baseNode' | 'nestedEditors' | 'transientProps'
>

/**
 * The one wrapper-layer assembly helper (plan 039, Batch 5): builds the
 * registered node class for a card from its declaration. The assembled class
 * subclasses the declaration's React-free base node and adopts the spec
 * statics — `nestedEditors` and `transientProps` (read off `this.constructor`
 * by the generated node machinery). Its only method is `decorate()`,
 * delegating to the shared adapter (`@/nodes/decorate-card`).
 *
 * Behaviour the spec language can't express is NOT assembled here: gallery
 * image helpers and the isEmpty()/getCardWidth() overrides live on the base
 * node classes. The transient accessors ARE spec language — the get/set
 * pair for each `accessor: true` entry is defined on the assembled
 * prototype below, riding the same spec-adoption lifecycle as the fields.
 *
 * The base class's `getType`/`clone`/`importJSON`/`exportJSON` are inherited,
 * not own properties, so the assembled class runs through
 * `ensureLexicalNodeOwnMethods` at assembly time — with every card assembled,
 * no registry-level own-method pass remains.
 */
export function assembleCardNode<
  TNode extends LexicalNode,
  D extends CardAssemblyDeclaration = CardAssemblyDeclaration,
  // oxlint-disable-next-line typescript/no-explicit-any
>(declaration: D & { baseNode: new (...args: any[]) => TNode }): CardNodeClass<TNode, D> {
  // oxlint-disable-next-line typescript/no-explicit-any
  const baseNode = declaration.baseNode as new (...args: any[]) => LexicalNode

  class AssembledCardNode extends baseNode {
    static nestedEditors = declaration.nestedEditors
    static transientProps = declaration.transientProps

    // Stamped at assembly, not inherited from the generated base: every card
    // built through the declaration pipeline — built-in or host-defined,
    // generated or hand-written base — passes the $isInklingCard gate
    // (registerCardSelection, InklingCardWrapper) with no per-class ceremony.
    isInklingCard(): true {
      return true
    }

    decorate(): ReactNode {
      return decorateCard(this)
    }
  }

  // the spec's accessor entries: one get/set pair per `accessor: true`
  // transient prop, reading/writing its private field
  interface FieldCarrier {
    getLatest(): Record<string, unknown>
    getWritable(): Record<string, unknown>
  }
  for (const spec of declaration.transientProps ?? []) {
    if (!spec.accessor) {
      continue
    }
    const privateName = spec.privateName ?? `__${spec.name}`
    Object.defineProperty(AssembledCardNode.prototype, spec.name, {
      get: function (this: FieldCarrier) {
        return this.getLatest()[privateName]
      },
      set: function (this: FieldCarrier, value: unknown) {
        this.getWritable()[privateName] = value
      },
    })
  }

  ensureLexicalNodeOwnMethods(AssembledCardNode)

  return AssembledCardNode as unknown as CardNodeClass<TNode, D>
}

// `var` hoists: a shim reached through the wrapper-layer import cycle (shim →
// card-wrappers → assemble-card-node → decorate tree → plugins/components →
// shim) calls `assembleCardNodeOnce` while this module is still evaluating, so
// the cache binding must exist before any module body runs — a `const` would
// still be in its TDZ.
// oxlint-disable-next-line no-var
var assembledCardNodeCache: WeakMap<object, CardNodeClass<LexicalNode>> | undefined

/**
 * The single-site card assembler (plan 039, Batch 5): every caller — the
 * wrapper-layer projection (`@/nodes/cards/card-wrappers`), the shim
 * modules (`@/nodes/AudioNode` and friends), and `defineCard`
 * (`@/nodes/cards/host-cards`) for host cards — assembles a card's
 * registered class through this memoized helper, so exactly one class object
 * exists per declaration and importDOM/clone identity is coherent across
 * every consumer. Keyed on the declaration object itself: the declarations
 * are the per-card source of truth and never import the wrapper layer, so
 * the same object reaches every caller.
 *
 * Memoization must live behind a hoisted function (never a module-level
 * `const` map read): the wrapper layer's import closure contains the React
 * decorate tree, whose components/plugins value-import the shim modules —
 * when a shim is evaluated mid-cycle it calls this function before the
 * wrapper-layer module bodies have run.
 */
export function assembleCardNodeOnce<
  TNode extends LexicalNode,
  D extends CardAssemblyDeclaration = CardAssemblyDeclaration,
  // oxlint-disable-next-line typescript/no-explicit-any
>(declaration: D & { baseNode: new (...args: any[]) => TNode }): CardNodeClass<TNode, D> {
  assembledCardNodeCache ??= new WeakMap()
  const cached = assembledCardNodeCache.get(declaration)
  if (cached) {
    return cached as unknown as CardNodeClass<TNode, D>
  }
  const assembled = assembleCardNode(declaration)
  assembledCardNodeCache.set(declaration, assembled)
  return assembled
}
