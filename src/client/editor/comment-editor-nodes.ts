// The comment editor's composer node set (plan
// docs/plans/inkling-editor-replacement.md, R12): EDITOR_BASE_NODES minus the
// heading family (HeadingNode + its extended replacement pair), AsideNode,
// and the table element family, plus the CodeBlock / Math / MathInline
// classes. Every mounted type must stay inside COMMENT_NODE_TYPES
// (`@/shared/lexical/node-whitelist`) — the editor must never produce a node
// the storage schema rejects; the contract test
// (tests/unit/shared/contracts/lexical-node-whitelist.test.ts) pins this
// list's types against the whitelist and `COMMENT_COMPOSER_NODE_TYPES`.
//
// The QuoteNode + extended-quote replacement pair stays (blockquote is a
// comment capability); only `extended-quote` ever serializes. AutoLinkNode
// stays because CorePlugins' InklingAutoLinkPlugin is always mounted, so
// typed URLs autolink. AsideNode is filtered out (as on the page composer)
// because inkling's Ctrl+Q quote→aside→paragraph cycle would construct one —
// the comment editor captures the chord host-side before inkling sees it.
// Node-replacement pair entries carry no static getType, so the filter reads
// the pair's `replace` class instead.

import { CodeBlockNode, EDITOR_BASE_NODES, MathInlineNode, MathNode } from '@inkling/editor'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

const COMMENT_EXCLUDED_BASE_TYPES = new Set(['heading', 'extended-heading', 'aside', 'table', 'tablerow', 'tablecell'])

const EDITOR_BASE_COMMENT = EDITOR_BASE_NODES.filter((entry) => {
  const klass = unsafeCast<{ getType?: () => string; replace?: { getType?: () => string } }>(entry)
  const type = typeof klass.getType === 'function' ? klass.getType() : klass.replace?.getType?.()
  return type === undefined || !COMMENT_EXCLUDED_BASE_TYPES.has(type)
})

export const COMMENT_EDITOR_NODES = [...EDITOR_BASE_COMMENT, CodeBlockNode, MathNode, MathInlineNode]
