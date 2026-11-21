import type {
  CardSpecAccessorMap,
  CardSpecFieldMap,
  NestedEditorSpec,
  TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'
import type { CardDeclaration } from '@kobato/inkling-internal/nodes/cards/card-declaration'
import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

import { getTransientPropPrivateName } from '@kobato/inkling-internal/nodes/base/card-specs'
import { ensureLexicalNodeOwnMethods } from '@kobato/inkling-internal/nodes/base/ensure-node-own-methods'
import { defineFieldAccessor } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { decorateCardNode } from '@kobato/inkling-internal/nodes/card-decorate-slot'

export type CardNodeClass<TNode extends LexicalNode, D = unknown> = {
  [k in keyof typeof LexicalNode]: (typeof LexicalNode)[k]
} & {
  // oxlint-disable-next-line typescript/no-explicit-any
  new (...args: any[]): TNode & { decorate(): ReactNode } & CardSpecFieldMap<D> &
    CardSpecAccessorMap<D> & {
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

export type CardAssemblyDeclaration = Pick<
  CardDeclaration,
  'nodeType' | 'baseNode' | 'nestedEditors' | 'transientProps'
>
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
    isInklingCard(): true {
      return true
    }
    decorate(): ReactNode {
      return decorateCardNode(this)
    }
  }

  for (const spec of declaration.transientProps ?? []) {
    if (!spec.accessor) {
      continue
    }
    defineFieldAccessor(AssembledCardNode.prototype, spec.name, getTransientPropPrivateName(spec))
  }

  ensureLexicalNodeOwnMethods(AssembledCardNode)

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- class-factory boundary; the assembled class carries every member at runtime
  return AssembledCardNode as unknown as CardNodeClass<TNode, D>
}

// oxlint-disable-next-line no-var
var assembledCardNodeCache: WeakMap<object, CardNodeClass<LexicalNode>> | undefined

export function assembleCardNodeOnce<
  TNode extends LexicalNode,
  D extends CardAssemblyDeclaration = CardAssemblyDeclaration,
  // oxlint-disable-next-line typescript/no-explicit-any
>(declaration: D & { baseNode: new (...args: any[]) => TNode }): CardNodeClass<TNode, D> {
  assembledCardNodeCache ??= new WeakMap()
  const cached = assembledCardNodeCache.get(declaration)
  if (cached) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- memoization cache; the key identity carries the type
    return cached as unknown as CardNodeClass<TNode, D>
  }
  const assembled = assembleCardNode(declaration)
  assembledCardNodeCache.set(declaration, assembled)
  return assembled
}
