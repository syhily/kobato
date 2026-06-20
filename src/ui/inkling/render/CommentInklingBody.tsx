import { Fragment, type ReactNode } from 'react'

import type { InklingDocument, InklingInlineNode, InklingListItemNode, InklingListNode } from '@/shared/inkling/schema'

import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import {
  INKLING_FORMAT_BOLD,
  INKLING_FORMAT_CODE,
  INKLING_FORMAT_ITALIC,
  INKLING_FORMAT_STRIKETHROUGH,
  INKLING_FORMAT_UNDERLINE,
} from '@/shared/inkling/format'
import { walkInkling } from '@/shared/inkling/walk'
import { sanitizeUrl } from '@/shared/sanitize-url'
import { safeRel } from '@/ui/lib/link'

// SSR-safe React renderer for Inkling comment bodies. It only supports the
// comment feature subset; encountering an article-only node throws so that
// mismigrated data cannot silently degrade.

// Lexical text format bits, imported from the shared source of truth so they
// stay in sync with lexical's IS_* constants (underline = 8, code = 16).
const FORMAT_BOLD = INKLING_FORMAT_BOLD
const FORMAT_ITALIC = INKLING_FORMAT_ITALIC
const FORMAT_UNDERLINE = INKLING_FORMAT_UNDERLINE
const FORMAT_CODE = INKLING_FORMAT_CODE
const FORMAT_STRIKETHROUGH = INKLING_FORMAT_STRIKETHROUGH

function hasFormat(format: number | undefined, bit: number): boolean {
  return ((format ?? 0) & bit) !== 0
}

function assertCommentOnlyInlineType(type: string): void {
  if (type === 'footnote-ref') {
    throw new Error(`CommentInklingBody cannot render article-only inline node: ${type}`)
  }
}

function assertCommentOnlyBlockType(type: string): void {
  const forbidden = new Set<string>([
    'heading',
    'image-card',
    'horizontal-rule',
    'music-card',
    'table',
    'solution',
    'two-column',
    'footnote-definition',
  ])
  if (forbidden.has(type)) {
    throw new Error(`CommentInklingBody cannot render article-only block node: ${type}`)
  }
}

function renderInlineNode(node: InklingInlineNode, key: string): ReactNode {
  switch (node.type) {
    case 'text': {
      const format = node.format ?? 0
      let children: ReactNode = node.text
      if (hasFormat(format, FORMAT_CODE)) {
        // CODE is exclusive per Lexical semantics.
        children = <code>{children}</code>
      } else {
        if (hasFormat(format, FORMAT_STRIKETHROUGH)) {
          children = <s>{children}</s>
        }
        if (hasFormat(format, FORMAT_UNDERLINE)) {
          children = <u>{children}</u>
        }
        if (hasFormat(format, FORMAT_ITALIC)) {
          children = <em>{children}</em>
        }
        if (hasFormat(format, FORMAT_BOLD)) {
          children = <strong>{children}</strong>
        }
      }
      return <Fragment key={key}>{children}</Fragment>
    }
    case 'linebreak':
      return <br key={key} />
    case 'inline-math':
      return <code key={key}>{`$${node.tex}$`}</code>
    case 'link':
      return (
        <a
          key={key}
          // Defense-in-depth: shared protocol whitelist + control-character
          // stripping via `sanitizeUrl`. Mirrors the article renderer in
          // marks/LinkMark.tsx.
          href={sanitizeUrl(node.url)}
          rel={safeRel(node.target, node.rel) ?? 'nofollow noreferrer'}
          target={node.target ?? '_blank'}
          title={node.title ?? undefined}
        >
          {renderInlineChildren(node.children)}
        </a>
      )
    case 'footnote-ref':
      assertCommentOnlyInlineType(node.type)
      return null
  }
}

function renderInlineChildren(children: ReadonlyArray<InklingInlineNode>): ReactNode {
  return children.map((child, index) => renderInlineNode(child, `${child.type}-${index}`))
}

function renderListNode(node: InklingListNode): ReactNode {
  assertCommentOnlyBlockType(node.type)
  const Tag = node.listType === 'number' ? 'ol' : 'ul'
  return (
    <Tag key={node.key ?? `list-${node.listType}`}>
      {node.children.map((item, index) => renderListItem(item, index))}
    </Tag>
  )
}

function renderListItem(item: InklingListItemNode, index: number): ReactNode {
  return (
    <li key={item.key ?? `li-${index}`}>
      {item.children.map((child, childIndex) => {
        if (child.type === 'list') {
          return renderListNode(child)
        }
        return renderInlineNode(child, `li-${index}-${child.type}-${childIndex}`)
      })}
    </li>
  )
}

export interface CommentInklingBodyProps {
  document: InklingDocument
  className?: string
}

export function CommentInklingBody({ document, className }: CommentInklingBodyProps): ReactNode {
  const modeValidation = validateInklingDocumentForMode(document, 'comment')
  if (!modeValidation.ok) {
    throw new Error(`CommentInklingBody: forbidden node ${modeValidation.forbiddenType} at ${modeValidation.path}`)
  }

  const blocks: ReactNode[] = []

  walkInkling(
    document,
    {
      paragraph: (node, _ctx, _walkChildren) => {
        blocks.push(<p key={node.key ?? `p-${blocks.length}`}>{renderInlineChildren(node.children)}</p>)
      },
      quote: (node) => {
        blocks.push(
          <blockquote key={node.key ?? `q-${blocks.length}`}>{renderInlineChildren(node.children)}</blockquote>,
        )
      },
      list: (node) => {
        blocks.push(renderListNode(node))
      },
      code: (node) => {
        blocks.push(
          <pre key={node.key ?? `code-${blocks.length}`}>
            <code data-language={node.language}>{node.code}</code>
          </pre>,
        )
      },
      mathBlock: (node) => {
        blocks.push(
          <pre key={node.key ?? `math-${blocks.length}`}>
            <code>{`$$${node.tex}$$`}</code>
          </pre>,
        )
      },
    },
    undefined,
  )

  return <div className={className}>{blocks}</div>
}
