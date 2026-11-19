import type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'

import { CARD_DECLARATIONS, type AnyCardDeclaration } from '@kobato/inkling-internal/nodes/cards'
import { describe, expect, it } from 'vitest'

const DERIVABLE_CARDS = ['audio', 'button', 'callout', 'file', 'horizontalrule', 'image', 'toggle', 'video']

const STRUCTURAL_CARDS = ['bookmark', 'codeblock', 'footnotedefinition', 'gallery', 'header', 'html', 'math']

function baseNodeImportSpec(declaration: AnyCardDeclaration): CardImportSpec | undefined {
  return declaration.baseNode.importSpec
}

describe('import spec classification', () => {
  it('every card either names an import spec on its base node or is pinned in the structural set', () => {
    const withSpec = CARD_DECLARATIONS.filter((declaration) => baseNodeImportSpec(declaration) !== undefined).map(
      (declaration) => declaration.nodeType,
    )
    const structural = CARD_DECLARATIONS.filter((declaration) => baseNodeImportSpec(declaration) === undefined).map(
      (declaration) => declaration.nodeType,
    )

    expect(withSpec.sort()).toEqual(DERIVABLE_CARDS)
    expect(structural.sort()).toEqual(STRUCTURAL_CARDS)
  })

  it('every read in every spec names a property of the base node', () => {
    CARD_DECLARATIONS.filter((declaration) => baseNodeImportSpec(declaration) !== undefined).forEach((declaration) => {
      const defaults = declaration.baseNode.getPropertyDefaults()
      const spec = baseNodeImportSpec(declaration) as CardImportSpec

      spec.conversions.forEach((conversion) => {
        conversion.reads.forEach((read) => {
          const names = read.kind === 'composite' ? (read.provides ?? []) : [read.name]
          names.forEach((name) => {
            expect(defaults, `${declaration.nodeType} read "${name}"`).toHaveProperty(name)
          })
        })
      })
    })
  })
})
