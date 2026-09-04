import type { SerializedEditorState } from '@inkling/editor/headless'

import { z } from 'zod'

import { FULL_EDITOR_NODE_TYPES, ROOT_NODE_TYPE } from '@/shared/lexical/node-whitelist'
import { isSafeUrl } from '@/shared/sanitize-url'

// Zod validation for the Lexical storage format (plan
// docs/plans/inkling-editor-replacement.md, round R7). The full editing
// state for posts/pages; `comment-schema.ts` builds the restricted comment
// variant from the same factory.
//
// Strictness mirrors the PT schema (`src/shared/pt/schema.ts`): every node
// variant enumerates its serialized fields explicitly with plain `z.object`
// (unknown keys are stripped, not rejected), required fields are the ones
// the 0.46 exporters always write, optional fields are the conditional
// ones.
//
// The node union covers the FULL whitelist and validates shape only; the
// per-surface policy (which subset is allowed, how deep lists may nest) is
// an iterative walk in `buildLexicalEditorStateSchema` — walking with an
// explicit stack keeps that pass recursion-free.
//
// The `SerializedEditorState` import is type-only (erased at build, never
// bundled — same idiom as `src/client/editor/inkling-labels.ts`); the
// schema itself has no lexical runtime dependency.

/** Validated node shape. Per-variant fields are enforced by the schema;
 * the recursive type only models what every node shares. */
export type LexicalNodeJson = {
  type: string
  version: number
  children?: LexicalNodeJson[]
}

/**
 * Recursion bound for the depth-tiered children below. PT was a flat block
 * array; Lexical is a tree, so a hostile body could nest nodes until the
 * recursive descent blows the stack — at the cap, element `children` must
 * be empty and validation fails instead of recursing further. Real
 * documents stay shallow: table > row > cell > paragraph is 4 levels below
 * root, a maximally nested article list is 12.
 */
export const MAX_TREE_DEPTH = 24

/** Article list nesting parity with the PT schema (`textBlockSchema`
 * allows `level` 1–6). Comments cap lower — see comment-schema.ts. */
export const ARTICLE_LIST_MAX_DEPTH = 6

const NODE_VERSION = z.number().int().min(1)

// SerializedElementNode fields (lexical 0.46 dist LexicalElementNode.d.ts).
const DIRECTION = z.enum(['ltr', 'rtl']).nullable()
const ELEMENT_FORMAT = z.enum(['left', 'start', 'center', 'right', 'end', 'justify', ''])
const INDENT = z.number().int().min(0)

// SerializedTextNode fields (lexical 0.46 dist nodes/LexicalTextNode.d.ts).
const TEXT_FIELDS = {
  detail: z.number().int(),
  format: z.number().int(),
  mode: z.enum(['normal', 'token', 'segmented']),
  style: z.string(),
  text: z.string(),
} as const

const SAFE_URL_MESSAGE = 'url must not use javascript:, data:, or vbscript: protocol'

// Depth-tiered children: the union for the next level is built lazily and
// memoized per depth, so the schema graph is finite; at MAX_TREE_DEPTH
// element children must be empty (the depth-bomb guard).
const tierCache = new Map<number, z.ZodType<LexicalNodeJson>>()

function nodeSchemaAtDepth(treeDepth: number): z.ZodType<LexicalNodeJson> {
  const cached = tierCache.get(treeDepth)
  if (cached) {
    return cached
  }
  const result = buildNodeUnion(treeDepth)
  tierCache.set(treeDepth, result)
  return result
}

function buildNodeUnion(treeDepth: number): z.ZodType<LexicalNodeJson> {
  const atDepthCap = treeDepth >= MAX_TREE_DEPTH
  const children = atDepthCap ? z.tuple([]) : z.array(z.lazy(() => nodeSchemaAtDepth(treeDepth + 1)))

  const elementFields = {
    children,
    direction: DIRECTION,
    format: ELEMENT_FORMAT,
    indent: INDENT,
    textFormat: z.number().int().optional(),
    textStyle: z.string().optional(),
  } as const

  // PT parity: linkMarkDefSchema refines href through isSafeUrl.
  const linkFields = {
    url: z.string().refine((value) => isSafeUrl(value), { message: SAFE_URL_MESSAGE }),
    target: z.string().nullable().optional(),
    rel: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    ...elementFields,
  } as const

  return z.discriminatedUnion('type', [
    z.object({ type: z.literal('paragraph'), version: NODE_VERSION, ...elementFields }),
    z.object({ type: z.literal('linebreak'), version: NODE_VERSION }),
    z.object({
      type: z.literal('extended-heading'),
      version: NODE_VERSION,
      tag: z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
      ...elementFields,
    }),
    z.object({ type: z.literal('extended-quote'), version: NODE_VERSION, ...elementFields }),
    // Lists nest via list > listitem > list (lexical lists carry their
    // children directly; nesting depth is counted by the policy walk).
    z.object({
      type: z.literal('list'),
      version: NODE_VERSION,
      listType: z.enum(['bullet', 'number', 'check']),
      start: z.number().int(),
      tag: z.enum(['ul', 'ol']),
      ...elementFields,
    }),
    z.object({
      type: z.literal('listitem'),
      version: NODE_VERSION,
      checked: z.boolean().optional(),
      value: z.number().int(),
      ...elementFields,
    }),
    z.object({ type: z.literal('link'), version: NODE_VERSION, ...linkFields }),
    z.object({
      type: z.literal('autolink'),
      version: NODE_VERSION,
      isUnlinked: z.boolean().optional(),
      ...linkFields,
    }),
    z.object({ type: z.literal('extended-text'), version: NODE_VERSION, ...TEXT_FIELDS }),
    // TextNode entity whose visible text IS the 1-based citation index (the
    // renumber engine rewrites it in place); targetKey points at the cited
    // definition card. PT parity: footnoteRef required a non-empty
    // targetKey.
    z.object({
      type: z.literal('footnote-ref'),
      version: NODE_VERSION,
      ...TEXT_FIELDS,
      targetKey: z.string().min(1),
    }),
    z.object({
      type: z.literal('image'),
      version: NODE_VERSION,
      // Stock inkling dataset (base/nodes/image/ImageNode.ts
      // imageProperties + the hand-written exportJSON).
      src: z.string(),
      caption: z.string(),
      title: z.string(),
      alt: z.string(),
      cardWidth: z.enum(['regular', 'wide', 'full']),
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
      href: z.string(),
      // KobatoImageNode (R3 verdict, landing R10/R13): the three
      // pass-through keys the stock declaration silently drops, plus the
      // PT-style float layout (`cardWidth` has no left/right equivalent).
      thumbhash: z.string().optional(),
      storagePath: z.string().optional(),
      imageId: z.string().optional(),
      layout: z.enum(['left', 'center', 'right']).optional(),
    }),
    z.object({
      type: z.literal('codeblock'),
      version: NODE_VERSION,
      code: z.string(),
      language: z.string(),
      caption: z.string(),
      // Server-prerendered Shiki artifact slot — carried opaquely, filled
      // host-side on save (base/nodes/codeblock/CodeBlockNode.ts).
      highlightedHtml: z.string(),
    }),
    z.object({
      type: z.literal('math'),
      version: NODE_VERSION,
      tex: z.string(),
      // Server-prerendered KaTeX artifact slots (same invariant as
      // highlightedHtml; base/nodes/math/MathNode.ts).
      mathml: z.string(),
      svg: z.string(),
    }),
    z.object({
      type: z.literal('math-inline'),
      version: NODE_VERSION,
      tex: z.string(),
      mathml: z.string(),
      svg: z.string(),
    }),
    z.object({
      type: z.literal('footnotedefinition'),
      version: NODE_VERSION,
      // The nested editor's serialized HTML (not nested nodes — no
      // recursion through this field).
      content: z.string(),
      targetKey: z.string().min(1),
      // exportJSON derives the 1-based index from the node's rank in the
      // doc-end definition run (base/nodes/footnotedefinition/
      // FootnoteDefinitionNode.ts).
      index: z.number().int().min(1),
    }),
    z.object({ type: z.literal('horizontalrule'), version: NODE_VERSION }),
    z.object({
      type: z.literal('table'),
      version: NODE_VERSION,
      colWidths: z.array(z.number()).optional(),
      rowStriping: z.boolean().optional(),
      frozenColumnCount: z.number().int().min(0).optional(),
      frozenRowCount: z.number().int().min(0).optional(),
      ...elementFields,
    }),
    z.object({
      type: z.literal('tablerow'),
      version: NODE_VERSION,
      height: z.number().optional(),
      ...elementFields,
    }),
    z.object({
      type: z.literal('tablecell'),
      version: NODE_VERSION,
      headerState: z.number().int().min(0),
      colSpan: z.number().int().min(1).optional(),
      rowSpan: z.number().int().min(1).optional(),
      width: z.number().optional(),
      backgroundColor: z.string().nullable().optional(),
      verticalAlign: z.string().optional(),
      ...elementFields,
    }),
    // kobato host cards: type strings pinned in node-whitelist.ts, datasets
    // owned by the R10 spec modules in `@/shared/lexical/cards/`. solution /
    // two-column carry nested-editor HTML strings (opaque payload — the inner
    // surface is cleaned at save, not re-validated here). music-player's meta
    // snapshot keys are OPTIONAL: the canonicalize strip deletes them and a
    // failed resolve persists the meta-less shape by design
    // (`@/server/domains/pt/lexical-music-snapshot`).
    z.object({ type: z.literal('solution'), version: NODE_VERSION, content: z.string() }),
    z.object({
      type: z.literal('two-column'),
      version: NODE_VERSION,
      left: z.string(),
      right: z.string(),
    }),
    z.object({
      type: z.literal('music-player'),
      version: NODE_VERSION,
      playerId: z.string(),
      name: z.string().optional(),
      artist: z.string().optional(),
      cover: z.string().optional(),
      audioUrl: z.string().optional(),
      lyric: z.string().optional(),
    }),
  ])
}

export interface LexicalEditorStateSchemaOptions {
  /** Node types this surface accepts (node-whitelist.ts constants). */
  allowedTypes: readonly string[]
  /** Max `list` ancestry: a list nested deeper fails validation. Counts
   * `list` nodes on the ancestor chain — the list > listitem > list
   * nesting depth. */
  maxListDepth: number
}

/** Builds a `SerializedEditorState` schema for one surface: shape +
 * depth-bomb guard come from the shared union; the surface's node subset
 * and list-depth cap are enforced by an iterative walk. */
export function buildLexicalEditorStateSchema(options: LexicalEditorStateSchemaOptions) {
  const allowed = new Set(options.allowedTypes)
  const base = z.object({
    root: z.object({
      type: z.literal(ROOT_NODE_TYPE),
      version: NODE_VERSION,
      children: z.array(nodeSchemaAtDepth(1)),
      direction: DIRECTION,
      format: ELEMENT_FORMAT,
      indent: INDENT,
    }),
  })
  return base.superRefine((state, ctx) => {
    const stack: Array<{ node: LexicalNodeJson; listDepth: number; path: PropertyKey[] }> = state.root.children.map(
      (node, index) => ({ node, listDepth: 0, path: ['root', 'children', index] }),
    )
    while (stack.length > 0) {
      const frame = stack.pop()
      if (!frame) {
        continue
      }
      const { node, listDepth, path } = frame
      if (!allowed.has(node.type)) {
        ctx.addIssue({ code: 'custom', message: `node type "${node.type}" is not allowed in this state`, path })
        continue
      }
      let childListDepth = listDepth
      if (node.type === 'list') {
        if (listDepth >= options.maxListDepth) {
          ctx.addIssue({
            code: 'custom',
            message: `list nesting exceeds the maximum depth of ${options.maxListDepth}`,
            path,
          })
          continue
        }
        childListDepth = listDepth + 1
      }
      node.children?.forEach((child, index) => {
        stack.push({ node: child, listDepth: childListDepth, path: [...path, 'children', index] })
      })
    }
  })
}

export const lexicalEditorStateSchema = buildLexicalEditorStateSchema({
  allowedTypes: FULL_EDITOR_NODE_TYPES,
  maxListDepth: ARTICLE_LIST_MAX_DEPTH,
})

export type LexicalEditorState = z.infer<typeof lexicalEditorStateSchema>

// Compile-time guard: the validated storage shape must remain assignable
// to Lexical's own wire type.
export type LexicalEditorStateWireCheck = LexicalEditorState extends SerializedEditorState ? true : never
