import { describe, expect, it } from 'vitest'

import { CARD_DECLARATIONS } from '@/nodes/cards'
import {
  INSERT_AUDIO_COMMAND,
  INSERT_BOOKMARK_COMMAND,
  INSERT_BUTTON_COMMAND,
  INSERT_CALLOUT_COMMAND,
  INSERT_CODE_BLOCK_COMMAND,
  INSERT_FILE_COMMAND,
  INSERT_GALLERY_COMMAND,
  INSERT_HEADER_COMMAND,
  INSERT_HORIZONTAL_RULE_COMMAND,
  INSERT_HTML_COMMAND,
  INSERT_IMAGE_COMMAND,
  INSERT_MATH_COMMAND,
  INSERT_TOGGLE_COMMAND,
  INSERT_VIDEO_COMMAND,
  OPEN_GIF_SELECTOR_COMMAND,
  OPEN_IMAGE_LIBRARY_COMMAND,
  resolveCardInsertCommand,
  resolveCardMenuCommand,
} from '@/nodes/cards/card-commands'
import { CARD_MARKDOWN_DECLARATIONS } from '@/nodes/cards/card-markdown-transformers'
import { deriveCardNodes } from '@/nodes/cards/derive-card-nodes'

/**
 * Cross-registry consistency guard (CONTEXT.md: "card declaration"). The
 * declaration pipeline's derived views are each pinned in their own tests;
 * this file pins the AGREEMENT between the hand-keyed tables that remain —
 * the command constants keyed by node type in `card-commands`, and the
 * fence payload table in `card-markdown-transformers` — and the
 * declarations they derive from, so a new card cannot land in one table and
 * drift in another. The mechanically checkable legs of the "adding a card"
 * checklist in `src/nodes/cards/index.ts` live here and in
 * `card-declarations.test.ts` / `card-layering-imports.test.ts`.
 */

// The per-card insert command the public barrel (via the shims) exports —
// the resolution view must name exactly these objects, so a consumer
// dispatching `INSERT_IMAGE_COMMAND` and the registrar resolving the
// declaration's derived command always meet. The footnote definition is the
// one card with no insert command.
const EXPECTED_INSERT_COMMANDS = {
  audio: INSERT_AUDIO_COMMAND,
  bookmark: INSERT_BOOKMARK_COMMAND,
  button: INSERT_BUTTON_COMMAND,
  callout: INSERT_CALLOUT_COMMAND,
  codeblock: INSERT_CODE_BLOCK_COMMAND,
  file: INSERT_FILE_COMMAND,
  gallery: INSERT_GALLERY_COMMAND,
  header: INSERT_HEADER_COMMAND,
  horizontalrule: INSERT_HORIZONTAL_RULE_COMMAND,
  html: INSERT_HTML_COMMAND,
  image: INSERT_IMAGE_COMMAND,
  math: INSERT_MATH_COMMAND,
  toggle: INSERT_TOGGLE_COMMAND,
  video: INSERT_VIDEO_COMMAND,
} as const

describe('insert command resolution agrees with the declarations', () => {
  it('resolves every built-in card insert command to its public named constant', () => {
    const expected = new Map<string, unknown>(Object.entries(EXPECTED_INSERT_COMMANDS))

    for (const declaration of CARD_DECLARATIONS) {
      if (declaration.nodeType === 'footnotedefinition') {
        // no insert command — the footnote behaviour module creates and
        // orders definitions; the card declares neither menu nor insert spec
        expect('insert' in declaration).toBe(false)
        expect('menu' in declaration).toBe(false)
        continue
      }
      const command = expected.get(declaration.nodeType)
      expect(command, `${declaration.nodeType} has no expected insert command`).toBeDefined()
      expect(resolveCardInsertCommand(declaration.nodeType), declaration.nodeType).toBe(command)
    }
    // the expectation table covers no node type the declarations do not carry
    expect(expected.size).toBe(CARD_DECLARATIONS.length - 1)
  })

  it('resolves the named extras to the Image selector commands, used only by the Image menu', () => {
    expect(resolveCardMenuCommand('openGifSelector', 'image')).toBe(OPEN_GIF_SELECTOR_COMMAND)
    expect(resolveCardMenuCommand('openImageLibrary', 'image')).toBe(OPEN_IMAGE_LIBRARY_COMMAND)

    const extraUsages = CARD_DECLARATIONS.flatMap((declaration) =>
      ('menu' in declaration ? (declaration.menu ?? []) : [])
        .filter((entry) => entry.command !== 'insert')
        .map((entry) => `${declaration.nodeType}:${entry.labelKey}:${entry.command}`),
    )
    expect(extraUsages).toEqual(['image:gif:openGifSelector', 'image:imageLibrary:openImageLibrary'])
  })

  it('derives and memoizes one insert command per unknown (host) node type', () => {
    const command = resolveCardInsertCommand('guardProbeHostCard')
    expect(resolveCardInsertCommand('guardProbeHostCard')).toBe(command)
    expect(Object.values(EXPECTED_INSERT_COMMANDS)).not.toContain(command)
  })
})

describe('markdown fence wiring agrees with the declaration markdown specs', () => {
  const markdownByType = new Map(CARD_MARKDOWN_DECLARATIONS.map((card) => [card.nodeType, card]))

  it('pairs every fence-eligible declaration with a fence transformer named by its node type', () => {
    for (const declaration of CARD_DECLARATIONS) {
      const markdown = 'markdown' in declaration ? declaration.markdown : undefined
      const transformer = markdownByType.get(declaration.nodeType)?.markdownTransformer

      if (markdown?.kind === 'fence') {
        // the fence tag is derived, never declared: the projection feeds the
        // declaration's own nodeType to createCardTransformer
        expect(transformer, declaration.nodeType).toBeDefined()
        expect(
          transformer && 'regExpStart' in transformer ? transformer.regExpStart.source : undefined,
          declaration.nodeType,
        ).toBe('^```inkling:' + declaration.nodeType + '\\s*$')
      } else if (markdown?.kind === 'exempt') {
        // exempt cards speak plain markdown — no inkling fence transformer;
        // Image's hand-written `![alt](src)` element transformer is the one
        // named exception
        if (declaration.nodeType === 'image') {
          expect(transformer).toBeDefined()
          expect(transformer && 'regExpStart' in transformer).toBe(false)
        } else {
          expect(transformer, declaration.nodeType).toBeUndefined()
        }
      } else {
        expect(markdown, `${declaration.nodeType} must declare its markdown spec`).toBeUndefined()
        expect(transformer, declaration.nodeType).toBeUndefined()
      }
    }
  })

  it('derives the markdown round-trip node set from exactly the markdown-bearing declarations', () => {
    const eligible = CARD_DECLARATIONS.filter((declaration) => 'markdown' in declaration && declaration.markdown)
    expect(deriveCardNodes(CARD_MARKDOWN_DECLARATIONS).map((card) => card.nodeType)).toEqual(
      eligible.map((declaration) => declaration.nodeType),
    )
  })
})
