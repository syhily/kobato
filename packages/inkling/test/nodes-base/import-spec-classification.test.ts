import type { CardImportSpec } from '@/nodes/base/import-spec'

import { CARD_DECLARATIONS, type CardDeclaration } from '@/nodes/cards'

/**
 * Import-spec classification invariant (CONTEXT.md: "import spec"): every
 * card's base node class either names its DOM-import knowledge (a static
 * `importSpec`, from which the generated node machinery derives `importDOM`)
 * or is pinned here in the structural set, keeping a hand-written parser.
 * The sets may only change deliberately — shrinking the derivable set is
 * acceptable (record the why-comment on the surviving parser); growing the
 * structural set needs vocabulary the flat reads can't express.
 */

const DERIVABLE_CARDS = ['audio', 'button', 'callout', 'file', 'horizontalrule', 'image', 'toggle', 'video']

const STRUCTURAL_CARDS = ['bookmark', 'codeblock', 'footnotedefinition', 'gallery', 'header', 'html', 'math']

function baseNodeImportSpec(declaration: CardDeclaration): CardImportSpec | undefined {
  // declaration.baseNode is typed CardBaseNodeClass — the generated statics
  // are on the field type, no cast
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
