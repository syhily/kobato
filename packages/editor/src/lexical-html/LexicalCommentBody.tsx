import type {
  LexicalCommentBlockNode,
  LexicalCommentBody,
  LexicalCommentInlineNode,
  LexicalCommentLinkNode,
  LexicalCommentListItemNode,
  LexicalCommentListNode,
} from '@kobato/shared/lexical/comment-schema'
import type { LexicalCodeNode } from '@kobato/shared/lexical/schema'
import type { ReactNode } from 'react'

import { safeRel } from '@kobato/editor/engine/lib/link'
import { sanitizeHtml } from '@kobato/editor/engine/lib/sanitize-html'
import { BODY_WRAPPER_CLASS, codeLanguageClass, PT_INLINE } from '@kobato/editor/lexical-html/manifest'
import { CodeBlock as CodeBlockComponent } from '@kobato/editor/renderer/blocks/CodeBlock'
import { renderMathMarkupOrTexFallback } from '@kobato/editor/renderer/render-marks'
import { sanitizeUrl } from '@kobato/shared/sanitize-url'

// React tree renderer for `LexicalCommentBody` — the client/SSR twin of
// the string renderer in `./comment-to-html` (its `default` mode). Pure
// JSON traversal over the EditorState (NO `@lexical/*` runtime), using
// the same manifest constants, so both adapters emit the same HTML
// contract on the comment dialect: `PT_INLINE` mark classes,
// `alignClass` paragraph/quote alignment, MathML/SVG math wrappers,
// `language-*` / `data-language` code blocks, wrapped in
// `BODY_WRAPPER_CLASS`. Quote children render as `<p>`; listitem
// children render paragraphs (with `<p>`) and nested lists; the 0.45
// runtime inline children render bare inside `<li>`.
//
// The one deliberate divergence from the string renderer: code blocks
// render through the shared `CodeBlock` component (the copy button), the
// same structural divergence the body renderer makes.

export interface LexicalCommentBodyProps {
  body: LexicalCommentBody
}

export function LexicalCommentBody({ body }: LexicalCommentBodyProps) {
  return (
    <div className={BODY_WRAPPER_CLASS}>
      {body.root.children.map((block, index) => (
        // oxlint-disable-next-line react/no-array-index-key
        <Block key={index} node={block} />
      ))}
    </div>
  )
}

function Block({ node }: { node: LexicalCommentBlockNode | LexicalCommentListItemNode }): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return <p className={alignClassOf(node.format)}>{renderInlines(node.children)}</p>
    case 'quote':
      return (
        <blockquote className={alignClassOf(node.format)}>
          {node.children.map((child, index) => (
            // oxlint-disable-next-line react/no-array-index-key
            <Block key={index} node={child} />
          ))}
        </blockquote>
      )
    case 'list':
      return <List node={node} />
    case 'listitem':
      return <ListItem node={node} />
    case 'code':
      return <CodeBlock node={node} />
    case 'mathBlock':
      return renderMathMarkupOrTexFallback(node.tex, node.mathml, node.svg, 'display')
  }
}

function List({ node }: { node: LexicalCommentListNode }): ReactNode {
  const Tag = node.tag === 'ul' ? 'ul' : 'ol'
  return (
    <Tag>
      {node.children.map((child, index) => (
        // oxlint-disable-next-line react/no-array-index-key
        <Block key={index} node={child} />
      ))}
    </Tag>
  )
}

function ListItem({ node }: { node: LexicalCommentListItemNode }): ReactNode {
  return (
    <li>
      {node.children.map((child, index) => {
        if (child.type === 'list' || child.type === 'paragraph') {
          // oxlint-disable-next-line react/no-array-index-key
          return <Block key={index} node={child} />
        }
        // The 0.45 runtime shape: inline children directly in the item.
        // oxlint-disable-next-line react/no-array-index-key
        return <Inline key={index} node={child} />
      })}
    </li>
  )
}

function CodeBlock({ node }: { node: LexicalCodeNode }): ReactNode {
  const text = node.children.map((child) => child.text).join('')
  const language = node.language
  if (node.highlightedHtml !== undefined && node.highlightedHtml !== '') {
    // Server prerender artifact (Shiki) — the comment save path
    // pre-renders code through the same prerender as post bodies, so the
    // React tree injects the sanitized highlight like the body renderer.
    return (
      <CodeBlockComponent
        className={codeLanguageClass(language)}
        copyText={text}
        data-language={language}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.highlightedHtml, 'shiki') }}
      />
    )
  }
  return (
    <CodeBlockComponent>
      <code className={codeLanguageClass(language)} data-language={language}>
        {text}
      </code>
    </CodeBlockComponent>
  )
}

// --- inline rendering ---------------------------------------------------------

function renderInlines(nodes: readonly LexicalCommentInlineNode[]): ReactNode {
  return nodes.map((node, index) => (
    // oxlint-disable-next-line react/no-array-index-key
    <Inline key={index} node={node} />
  ))
}

function Inline({ node }: { node: LexicalCommentInlineNode }): ReactNode {
  switch (node.type) {
    case 'text':
      return renderText(node)
    case 'linebreak':
      return <br />
    case 'link':
      return <Link node={node} />
    case 'mathInline':
      return renderMathMarkupOrTexFallback(node.tex, node.mathml, node.svg, 'inline')
  }
}

function renderText(node: Extract<LexicalCommentInlineNode, { type: 'text' }>): ReactNode {
  // Decorator marks fold into the format bitmask; wrap in ascending bit
  // order — the deterministic render order (same as the body renderer).
  let out: ReactNode = node.text
  if ((node.format & 1) !== 0) {
    out = <strong className={PT_INLINE.strong}>{out}</strong>
  }
  if ((node.format & 2) !== 0) {
    out = <em className={PT_INLINE.em}>{out}</em>
  }
  if ((node.format & 4) !== 0) {
    out = <s className={PT_INLINE.strike}>{out}</s>
  }
  if ((node.format & 8) !== 0) {
    out = <u className={PT_INLINE.underline}>{out}</u>
  }
  if ((node.format & 16) !== 0) {
    out = <code className={PT_INLINE.code}>{out}</code>
  }
  return out
}

function Link({ node }: { node: LexicalCommentLinkNode }): ReactNode {
  // Defense-in-depth: never emit executable JavaScript or data URLs even
  // if the gate is bypassed. `sanitizeUrl` also strips C0 control chars.
  return (
    <a
      href={sanitizeUrl(node.url)}
      rel={safeRel(node.target, node.rel)}
      target={node.target ?? undefined}
      className={PT_INLINE.link}
    >
      {renderInlines(node.children)}
    </a>
  )
}

// --- alignment -----------------------------------------------------------------

const ALIGN_CLASS = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

/** Map a lexical element `format` to its text-align utility, `undefined` when unset. */
function alignClassOf(align: string | undefined): string | undefined {
  if (align === 'left' || align === 'center' || align === 'right') {
    return ALIGN_CLASS[align]
  }
  return undefined
}
