import type { SerializedEditorState } from 'lexical'

import { normalizeLexicalDialect } from '@kobato/inkling-internal/headless/dialect'
import { FULL_EDITOR_NODE_TYPES, ROOT_NODE_TYPE } from '@kobato/inkling-internal/headless/node-whitelist'
import { isSafeUrl } from '@kobato/sanitize/sanitize-url'
import { z } from 'zod'

export type LexicalNodeJson = {
  type: string
  version: number
  children?: LexicalNodeJson[]
}

export const MAX_TREE_DEPTH = 24

export const ARTICLE_LIST_MAX_DEPTH = 6

const NODE_VERSION = z.number().int().min(1)

const DIRECTION = z.enum(['ltr', 'rtl']).nullable()
const ELEMENT_FORMAT = z.enum(['left', 'start', 'center', 'right', 'end', 'justify', ''])
const INDENT = z.number().int().min(0)

const TEXT_FIELDS = {
  detail: z.number().int(),
  format: z.number().int(),
  mode: z.enum(['normal', 'token', 'segmented']),
  style: z.string(),
  text: z.string(),
} as const

const SAFE_URL_MESSAGE = 'url must not use javascript:, data:, or vbscript: protocol'

const nodeSchema: z.ZodType<LexicalNodeJson> = z.lazy(() => nodeUnion)

function buildNodeUnion(): z.ZodType<LexicalNodeJson> {
  const children = z.array(nodeSchema)

  const elementFields = {
    children,
    direction: DIRECTION,
    format: ELEMENT_FORMAT,
    indent: INDENT,
    textFormat: z.number().int().optional(),
    textStyle: z.string().optional(),
  } as const

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
    z.object({
      type: z.literal('footnote-ref'),
      version: NODE_VERSION,
      ...TEXT_FIELDS,
      targetKey: z.string().min(1),
    }),
    z.object({
      type: z.literal('image'),
      version: NODE_VERSION,
      src: z.string(),
      caption: z.string(),
      title: z.string(),
      alt: z.string(),
      cardWidth: z.enum(['regular', 'wide', 'full']),
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
      href: z.string(),
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
      highlightedHtml: z.string(),
    }),
    z.object({
      type: z.literal('math'),
      version: NODE_VERSION,
      tex: z.string(),
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
      content: z.string(),
      targetKey: z.string().min(1),
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

const nodeUnion = buildNodeUnion()

function boundTreeDepth(value: unknown, ctx: z.RefinementCtx): unknown {
  const root = value !== null && typeof value === 'object' && 'root' in value ? value.root : undefined
  if (root === null || typeof root !== 'object') {
    return value
  }
  const stack: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }]
  while (stack.length > 0) {
    const frame = stack.pop()
    if (!frame) {
      continue
    }
    if (frame.depth > MAX_TREE_DEPTH) {
      ctx.addIssue({ code: 'custom', message: `tree nesting exceeds the maximum depth of ${MAX_TREE_DEPTH}` })
      return value
    }
    const node = frame.node
    if (node !== null && typeof node === 'object' && 'children' in node) {
      const children = node.children
      if (Array.isArray(children)) {
        for (const child of children) {
          stack.push({ node: child, depth: frame.depth + 1 })
        }
      }
    }
  }
  return value
}

export interface LexicalEditorStateSchemaOptions {
  allowedTypes: readonly string[]
  maxListDepth: number
}

export function buildLexicalEditorStateSchema(options: LexicalEditorStateSchemaOptions) {
  const allowed = new Set(options.allowedTypes)
  const base = z.object({
    root: z.object({
      type: z.literal(ROOT_NODE_TYPE),
      version: NODE_VERSION,
      children: z.array(nodeSchema),
      direction: DIRECTION,
      format: ELEMENT_FORMAT,
      indent: INDENT,
    }),
  })
  return z.preprocess(
    boundTreeDepth,
    z.preprocess(
      normalizeLexicalDialect,
      base.superRefine((state, ctx) => {
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
      }),
    ),
  )
}

export const lexicalEditorStateSchema = buildLexicalEditorStateSchema({
  allowedTypes: FULL_EDITOR_NODE_TYPES,
  maxListDepth: ARTICLE_LIST_MAX_DEPTH,
})

export type LexicalEditorState = z.infer<typeof lexicalEditorStateSchema>

export const EMPTY_LEXICAL_EDITOR_STATE: LexicalEditorState = {
  root: { type: 'root', version: 1, children: [], direction: 'ltr', format: '', indent: 0 },
}

export type LexicalEditorStateWireCheck = LexicalEditorState extends SerializedEditorState ? true : never
