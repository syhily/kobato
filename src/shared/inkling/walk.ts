import type {
  InklingBlockNode,
  InklingCodeBlockNode,
  InklingDocument,
  InklingFootnoteDefinitionNode,
  InklingFootnoteRefNode,
  InklingHeadingNode,
  InklingHorizontalRuleNode,
  InklingImageCardNode,
  InklingInlineMathNode,
  InklingInlineNode,
  InklingLineBreakNode,
  InklingLinkNode,
  InklingListItemNode,
  InklingListNode,
  InklingMathBlockNode,
  InklingMusicCardNode,
  InklingNonRecursiveBlockNode,
  InklingParagraphNode,
  InklingQuoteNode,
  InklingSolutionNode,
  InklingTableCellNode,
  InklingTableNode,
  InklingTextNode,
  InklingTwoColumnNode,
} from '@/shared/inkling/schema'

export interface InklingWalkerHandlers<T> {
  text?: InklingNodeHandler<InklingTextNode, T>
  paragraph?: InklingNodeHandler<InklingParagraphNode, T>
  heading?: InklingNodeHandler<InklingHeadingNode, T>
  quote?: InklingNodeHandler<InklingQuoteNode, T>
  list?: InklingNodeHandler<InklingListNode, T>
  listitem?: InklingNodeHandler<InklingListItemNode, T>
  linebreak?: InklingNodeHandler<InklingLineBreakNode, T>
  link?: InklingNodeHandler<InklingLinkNode, T>
  image?: InklingNodeHandler<InklingImageCardNode, T>
  code?: InklingNodeHandler<InklingCodeBlockNode, T>
  mathBlock?: InklingNodeHandler<InklingMathBlockNode, T>
  inlineMath?: InklingNodeHandler<InklingInlineMathNode, T>
  music?: InklingNodeHandler<InklingMusicCardNode, T>
  solution?: InklingNodeHandler<InklingSolutionNode, T>
  twoColumn?: InklingNodeHandler<InklingTwoColumnNode, T>
  table?: InklingNodeHandler<InklingTableNode, T>
  tableCell?: InklingNodeHandler<InklingTableCellNode, T>
  footnoteRef?: InklingNodeHandler<InklingFootnoteRefNode, T>
  footnoteDefinition?: InklingNodeHandler<InklingFootnoteDefinitionNode, T>
  horizontalRule?: InklingNodeHandler<InklingHorizontalRuleNode, T>
}

export type InklingNodeHandler<TNode, TCtx> = (node: TNode, ctx: TCtx, walkChildren: () => void) => void

function isFootnoteDefinitionNode(node: InklingBlockNode): node is InklingFootnoteDefinitionNode {
  return node.type === 'footnote-definition'
}

function walkInlineContainer<T>(
  node: { children: readonly InklingInlineNode[] },
  handlers: InklingWalkerHandlers<T>,
  ctx: T,
): void {
  for (const child of node.children) {
    walkInlineNode(child, handlers, ctx)
  }
}

function walkInlineNode<T>(node: InklingInlineNode, handlers: InklingWalkerHandlers<T>, ctx: T): void {
  switch (node.type) {
    case 'text': {
      handlers.text?.(node, ctx, () => undefined)
      return
    }
    case 'linebreak': {
      handlers.linebreak?.(node, ctx, () => undefined)
      return
    }
    case 'inline-math': {
      handlers.inlineMath?.(node, ctx, () => undefined)
      return
    }
    case 'footnote-ref': {
      handlers.footnoteRef?.(node, ctx, () => undefined)
      return
    }
    case 'link': {
      const walkChildren = () => walkInlineContainer(node, handlers, ctx)
      if (handlers.link !== undefined) {
        handlers.link(node, ctx, walkChildren)
      } else {
        walkChildren()
      }
      return
    }
  }
}

function walkListNode<T>(node: InklingListNode, handlers: InklingWalkerHandlers<T>, ctx: T): void {
  const walkChildren = () => {
    for (const item of node.children) {
      walkListItem(item, handlers, ctx)
    }
  }
  if (handlers.list !== undefined) {
    handlers.list(node, ctx, walkChildren)
  } else {
    walkChildren()
  }
}

function walkListItem<T>(item: InklingListItemNode, handlers: InklingWalkerHandlers<T>, ctx: T): void {
  const walkChildren = () => {
    for (const child of item.children) {
      if (child.type === 'list') {
        walkListNode(child, handlers, ctx)
      } else {
        walkInlineNode(child, handlers, ctx)
      }
    }
  }
  if (handlers.listitem !== undefined) {
    handlers.listitem(item, ctx, walkChildren)
  } else {
    walkChildren()
  }
}

function walkTableChildren<T>(node: InklingTableNode, handlers: InklingWalkerHandlers<T>, ctx: T): void {
  for (const row of node.rows) {
    for (const cell of row.cells) {
      const walkChildren = () => walkInlineContainer(cell, handlers, ctx)
      if (handlers.tableCell !== undefined) {
        handlers.tableCell(cell, ctx, walkChildren)
      } else {
        walkChildren()
      }
    }
  }
}

function walkInlineBlock<T>(
  node: InklingParagraphNode | InklingHeadingNode | InklingQuoteNode,
  handlers: InklingWalkerHandlers<T>,
  ctx: T,
): void {
  const walkChildren = () => walkInlineContainer(node, handlers, ctx)
  switch (node.type) {
    case 'paragraph': {
      if (handlers.paragraph !== undefined) {
        handlers.paragraph(node, ctx, walkChildren)
      } else {
        walkChildren()
      }
      return
    }
    case 'heading': {
      if (handlers.heading !== undefined) {
        handlers.heading(node, ctx, walkChildren)
      } else {
        walkChildren()
      }
      return
    }
    case 'quote': {
      if (handlers.quote !== undefined) {
        handlers.quote(node, ctx, walkChildren)
      } else {
        walkChildren()
      }
      return
    }
  }
}

function walkNonRecursiveBlockNode<T>(
  node: InklingNonRecursiveBlockNode,
  handlers: InklingWalkerHandlers<T>,
  ctx: T,
): void {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'quote': {
      walkInlineBlock(node, handlers, ctx)
      return
    }
    case 'list': {
      walkListNode(node, handlers, ctx)
      return
    }
    case 'image-card': {
      handlers.image?.(node, ctx, () => undefined)
      return
    }
    case 'code-block': {
      handlers.code?.(node, ctx, () => undefined)
      return
    }
    case 'math-block': {
      handlers.mathBlock?.(node, ctx, () => undefined)
      return
    }
    case 'music-card': {
      handlers.music?.(node, ctx, () => undefined)
      return
    }
    case 'table': {
      const walkChildren = () => walkTableChildren(node, handlers, ctx)
      if (handlers.table !== undefined) {
        handlers.table(node, ctx, walkChildren)
      } else {
        walkChildren()
      }
      return
    }
    case 'horizontal-rule': {
      handlers.horizontalRule?.(node, ctx, () => undefined)
      return
    }
  }
}

function walkBlockNode<T>(node: InklingBlockNode, handlers: InklingWalkerHandlers<T>, ctx: T): void {
  switch (node.type) {
    case 'solution': {
      const walkChildren = () => {
        for (const child of node.children) {
          walkNonRecursiveBlockNode(child, handlers, ctx)
        }
      }
      if (handlers.solution !== undefined) {
        handlers.solution(node, ctx, walkChildren)
      } else {
        walkChildren()
      }
      return
    }
    case 'two-column': {
      const walkChildren = () => {
        for (const child of node.left) {
          walkNonRecursiveBlockNode(child, handlers, ctx)
        }
        for (const child of node.right) {
          walkNonRecursiveBlockNode(child, handlers, ctx)
        }
      }
      if (handlers.twoColumn !== undefined) {
        handlers.twoColumn(node, ctx, walkChildren)
      } else {
        walkChildren()
      }
      return
    }
    case 'footnote-definition': {
      const walkChildren = () => {
        for (const child of node.children) {
          walkNonRecursiveBlockNode(child, handlers, ctx)
        }
      }
      if (handlers.footnoteDefinition !== undefined) {
        handlers.footnoteDefinition(node, ctx, walkChildren)
      } else {
        walkChildren()
      }
      return
    }
    case 'paragraph':
    case 'heading':
    case 'quote':
    case 'list':
    case 'image-card':
    case 'code-block':
    case 'math-block':
    case 'music-card':
    case 'table':
    case 'horizontal-rule':
      walkNonRecursiveBlockNode(node, handlers, ctx)
      return
  }
}

const RESIDUAL_HTML_RE = /<\/?[a-zA-Z]/

export interface ResidualHtmlMatch {
  /** The full text value of the offending text node. */
  text: string
  /** The first tag-shaped substring that triggered the match. */
  match: string
}

/**
 * Detect literal HTML tag-like sequences left inside text nodes. These are
 * normally a sign that an HTML import path failed to parse markup and leaked
 * raw source into span text. Used by migration verifiers and paste tests.
 */
export function findResidualHtmlInText(document: InklingDocument): ResidualHtmlMatch[] {
  const matches: ResidualHtmlMatch[] = []

  walkInkling(
    document,
    {
      text: (node) => {
        RESIDUAL_HTML_RE.lastIndex = 0
        const m = RESIDUAL_HTML_RE.exec(node.text)
        if (m !== null) {
          matches.push({ text: node.text, match: m[0] })
        }
      },
    },
    undefined,
  )

  return matches
}

/**
 * Framework-free depth-first walker over an Inkling document. The walker uses
 * the canonical render order: main column children first, then any
 * `footnote-definition` nodes are deferred to the end so that heading anchors
 * and plaintext extraction stay consistent with the SSR renderer.
 */
export function walkInkling<T>(document: InklingDocument, handlers: InklingWalkerHandlers<T>, ctx: T): T {
  const mainColumn: InklingBlockNode[] = []
  const footnotes: InklingBlockNode[] = []

  for (const node of document.root.children) {
    if (isFootnoteDefinitionNode(node)) {
      footnotes.push(node)
    } else {
      mainColumn.push(node)
    }
  }

  for (const node of mainColumn) {
    walkBlockNode(node, handlers, ctx)
  }
  for (const node of footnotes) {
    walkBlockNode(node, handlers, ctx)
  }

  return ctx
}
