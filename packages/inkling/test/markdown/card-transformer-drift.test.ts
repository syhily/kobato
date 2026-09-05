import type { ElementTransformer, MultilineElementTransformer } from '@lexical/markdown'

import { createHeadlessEditor } from '@lexical/headless'
import { $getRoot, type Klass, type LexicalEditor, type LexicalNode } from 'lexical'
import { describe, expect, it } from 'vitest'

import { CARD_MARKDOWN_DECLARATIONS } from '@/nodes/cards/card-markdown-transformers'

/**
 * Drift guard tying the card markdown transformers' field vocabulary to each
 * card's declared `properties` (the fence payloads themselves — the
 * documented intentional subset — are pinned byte-for-byte by
 * `round-trip-cards.test.ts`):
 *
 * - exhaustiveness leg: every markdown-eligible card (the declaration's
 *   `markdown` spec) carries a card transformer or names its exemption
 *   (`markdown: { kind: 'exempt' }` on the declaration).
 *   The projection already throws at module init on a fence-eligible card
 *   with no payload (and the payload table's exhaustive `Record` fails
 *   typecheck first); this leg pins the contract explicitly.
 * - export leg: every node field a transformer's `getData` reads must be a
 *   declared property of the card's node class. A renamed/typo'd read
 *   (`node.titel`) would otherwise export `undefined` silently.
 * - import leg: every field in the fence payload must survive
 *   `createNode` into the created node's `exportJSON`. A write to an
 *   undeclared property is silently dropped by the generated constructor, so
 *   the sentinel never lands and this fails. The created node must also hold
 *   no live `__*Editor` nested-editor instance — detachment is by
 *   construction (`$detachNestedEditorsForRoundTrip` in the transformer's
 *   `replace`), driven by the class's adopted `nestedEditors` spec.
 *
 * Fence keys themselves need NOT be property names — deliberate renames
 * (audio's `caption` → `title`, callout's `text` → `calloutText`, bookmark's
 * `metadata` remap) are part of the markdown vocabulary; the guard checks the
 * node-side fields, by value.
 */

// Lexical machinery a generated property getter touches on the proxied node —
// everything else the export leg records must be a declared card property
const LEXICAL_INTERNALS = new Set(['getLatest'])

type WrapperClass = (new () => LexicalNode) & { getPropertyDefaults(): Record<string, unknown> }

function createEditorWithNode(nodeClass: WrapperClass): { editor: LexicalEditor; node: LexicalNode } {
  const editor = createHeadlessEditor({
    nodes: [nodeClass as unknown as Klass<LexicalNode>],
    onError: (error) => {
      throw error
    },
  })
  let node!: LexicalNode
  editor.update(() => {
    node = new nodeClass()
    $getRoot().append(node)
  })
  return { editor, node }
}

/** Runs the transformer's export against a proxied node and returns the node fields it read. */
function recordExportReads(node: LexicalNode, transformer: ElementTransformer): string[] {
  const reads: string[] = []
  const proxy = new Proxy(node, {
    get(target, property, receiver) {
      if (typeof property === 'string') {
        reads.push(property)
      }
      return Reflect.get(target, property, receiver)
    },
  })
  transformer.export(proxy, () => '')
  return reads.filter((read) => !read.startsWith('__') && !LEXICAL_INTERNALS.has(read))
}

function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') {
    into.push(value)
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, into))
  } else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectStrings(entry, into))
  }
  return into
}

/** Extracts the parsed JSON body of an exported ` ```inkling:<card>``` ` fence. */
function parseFenceBody(exported: string): Record<string, unknown> {
  const body = exported.split('\n').slice(1, -1).join('\n')
  return JSON.parse(body) as Record<string, unknown>
}

const cardsWithTransformers = CARD_MARKDOWN_DECLARATIONS.filter((card) => card.markdownTransformer)

describe('card markdown transformer field vocabulary', function () {
  it('every markdown-eligible card has a transformer or a named exemption', function () {
    CARD_MARKDOWN_DECLARATIONS.forEach((card) => {
      // `in` narrows the union to the declarations carrying the optional markdown entry
      const markdown = 'markdown' in card ? card.markdown : undefined
      if (markdown === undefined) {
        return
      }
      expect(
        card.markdownTransformer !== undefined || markdown.kind === 'exempt',
        `${card.nodeType} is markdown-eligible but has neither a card transformer nor a named exemption`,
      ).toBe(true)
    })
  })

  cardsWithTransformers.forEach((card) => {
    const nodeClass = card.node as unknown as WrapperClass
    const transformer = card.markdownTransformer as ElementTransformer
    const declaredProperties = new Set(Object.keys(nodeClass.getPropertyDefaults()))

    describe(card.nodeType, function () {
      it('export reads only declared properties', function () {
        const { editor, node } = createEditorWithNode(nodeClass)
        const reads = editor.read(() => recordExportReads(node, transformer))
        reads.forEach((read) => {
          expect(
            declaredProperties.has(read),
            `${card.nodeType} transformer reads '${read}', which is not a declared property`,
          ).toBe(true)
        })
      })

      // only fence transformers carry a JSON field list; the image card uses
      // standard markdown image syntax, so there is no payload to drift
      if (!('regExpStart' in transformer)) {
        return
      }
      const fenceTransformer = transformer as unknown as MultilineElementTransformer & {
        export: NonNullable<MultilineElementTransformer['export']>
      }

      it('import lands every fence field in the serialized node', function () {
        const { editor, node } = createEditorWithNode(nodeClass)
        const exported = editor.read(() => fenceTransformer.export(node, () => ''))
        const defaultData = parseFenceBody(exported as string)

        Object.keys(defaultData).forEach((field) => {
          const sentinel = `drift-sentinel-${field}`
          const value = Array.isArray(defaultData[field]) ? [{ src: sentinel }] : sentinel
          const data = { ...defaultData, [field]: value }

          editor.update(() => {
            fenceTransformer.replace(
              $getRoot(),
              [],
              [] as unknown as RegExpMatchArray,
              [] as unknown as RegExpMatchArray,
              [JSON.stringify(data)],
              false,
            )
          })

          const created = editor.read(() => $getRoot().getLastChild())
          expect(created, `${card.nodeType} fence import did not append a node`).not.toBeNull()
          const json = editor.read(() => (created as LexicalNode).exportJSON())
          expect(
            collectStrings(json),
            `${card.nodeType} fence field '${field}' did not survive into the node's exportJSON`,
          ).toContain(sentinel)
        })
      })

      it('import leaves no live nested editor on the created node', function () {
        const { editor, node } = createEditorWithNode(nodeClass)
        const exported = editor.read(() => fenceTransformer.export(node, () => ''))
        const defaultData = parseFenceBody(exported as string)

        editor.update(() => {
          fenceTransformer.replace(
            $getRoot(),
            [],
            [] as unknown as RegExpMatchArray,
            [] as unknown as RegExpMatchArray,
            [JSON.stringify(defaultData)],
            false,
          )
        })

        const created = editor.read(() => $getRoot().getLastChild())
        expect(created, `${card.nodeType} fence import did not append a node`).not.toBeNull()
        // the class's adopted nestedEditors spec names every __<name> editor
        // field; a fence-created node must hold none of them live
        const specs =
          ((created as LexicalNode).constructor as { nestedEditors?: readonly { name: string }[] }).nestedEditors ?? []
        specs.forEach((spec) => {
          expect(
            (created as unknown as Record<string, unknown>)[`__${spec.name}`],
            `${card.nodeType} fence import left a live '__${spec.name}' nested editor on the created node`,
          ).toBeNull()
        })
      })
    })
  })
})
