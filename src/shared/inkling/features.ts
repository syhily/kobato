import type {
  InklingBlockNode,
  InklingDocument,
  InklingFeatureMode,
  InklingInlineNode,
  InklingListNode,
} from '@/shared/inkling/schema'

import { validateInklingDocument } from '@/shared/inkling/schema'

export const ARTICLE_FEATURE_TYPES = new Set<string>([
  'paragraph',
  'heading',
  'quote',
  'list',
  'listitem',
  'text',
  'linebreak',
  'link',
  'image-card',
  'code-block',
  'math-block',
  'inline-math',
  'music-card',
  'solution',
  'two-column',
  'table',
  'tablerow',
  'tablecell',
  'footnote-ref',
  'footnote-definition',
  'horizontal-rule',
])

export const COMMENT_FEATURE_TYPES = new Set<string>([
  'paragraph',
  'quote',
  'list',
  'listitem',
  'text',
  'linebreak',
  'link',
  'code-block',
  'math-block',
  'inline-math',
])

const ALL_INKLING_FEATURE_TYPES = new Set<string>(ARTICLE_FEATURE_TYPES)

export const FORBIDDEN_IN_COMMENT = new Set<string>(
  [...ALL_INKLING_FEATURE_TYPES].filter((type) => !COMMENT_FEATURE_TYPES.has(type)),
)

export interface InklingFeatureValidationResult {
  ok: true
}

export interface InklingFeatureValidationError {
  ok: false
  mode: InklingFeatureMode
  forbiddenType: string
  path: string
}

export type InklingFeatureValidation = InklingFeatureValidationResult | InklingFeatureValidationError

function collectInlineNodeTypes(node: InklingInlineNode, path: string, sink: Map<string, string>): void {
  sink.set(node.type, path)
  if (node.type === 'link') {
    for (let i = 0; i < node.children.length; i += 1) {
      collectInlineNodeTypes(node.children[i]!, `${path}.children[${i}]`, sink)
    }
  }
}

function collectListNodeTypes(node: InklingListNode, path: string, sink: Map<string, string>): void {
  sink.set(node.type, path)
  for (let i = 0; i < node.children.length; i += 1) {
    const item = node.children[i]!
    sink.set(item.type, `${path}.children[${i}]`)
    for (let j = 0; j < item.children.length; j += 1) {
      const child = item.children[j]!
      if (child.type === 'list') {
        collectListNodeTypes(child, `${path}.children[${i}].children[${j}]`, sink)
      } else {
        collectInlineNodeTypes(child, `${path}.children[${i}].children[${j}]`, sink)
      }
    }
  }
}

function collectBlockNodeTypes(node: InklingBlockNode, path: string, sink: Map<string, string>): void {
  sink.set(node.type, path)
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'quote': {
      for (let i = 0; i < node.children.length; i += 1) {
        collectInlineNodeTypes(node.children[i]!, `${path}.children[${i}]`, sink)
      }
      break
    }
    case 'list': {
      collectListNodeTypes(node, path, sink)
      break
    }
    case 'table': {
      for (let i = 0; i < node.rows.length; i += 1) {
        const row = node.rows[i]!
        sink.set(row.type, `${path}.rows[${i}]`)
        for (let j = 0; j < row.cells.length; j += 1) {
          const cell = row.cells[j]!
          sink.set(cell.type, `${path}.rows[${i}].cells[${j}]`)
          for (let k = 0; k < cell.children.length; k += 1) {
            collectInlineNodeTypes(cell.children[k]!, `${path}.rows[${i}].cells[${j}].children[${k}]`, sink)
          }
        }
      }
      break
    }
    case 'image-card':
    case 'code-block':
    case 'math-block':
    case 'music-card':
    case 'horizontal-rule': {
      // Leaf blocks: nothing to recurse.
      break
    }
    case 'solution':
    case 'footnote-definition': {
      for (let i = 0; i < node.children.length; i += 1) {
        collectBlockNodeTypes(node.children[i]!, `${path}.children[${i}]`, sink)
      }
      break
    }
    case 'two-column': {
      for (let i = 0; i < node.left.length; i += 1) {
        collectBlockNodeTypes(node.left[i]!, `${path}.left[${i}]`, sink)
      }
      for (let i = 0; i < node.right.length; i += 1) {
        collectBlockNodeTypes(node.right[i]!, `${path}.right[${i}]`, sink)
      }
      break
    }
  }
}

export function validateInklingDocumentForMode(
  document: InklingDocument,
  mode: InklingFeatureMode,
): InklingFeatureValidation {
  validateInklingDocument(document)

  const allowedTypes = mode === 'article' ? ARTICLE_FEATURE_TYPES : COMMENT_FEATURE_TYPES
  const seen = new Map<string, string>()
  for (let i = 0; i < document.root.children.length; i += 1) {
    collectBlockNodeTypes(document.root.children[i]!, `root.children[${i}]`, seen)
  }

  for (const [type, path] of seen) {
    if (!allowedTypes.has(type)) {
      return {
        ok: false,
        mode,
        forbiddenType: type,
        path,
      }
    }
  }

  return { ok: true }
}
