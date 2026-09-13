// The comment editor's composer node set (plan
// docs/plans/inkling-editor-replacement.md, R12): EDITOR_BASE_NODES minus the
// heading family (HeadingNode + its extended replacement pair), AsideNode,
// and the table element family, plus the CodeBlock class. Every mounted type
// must stay inside COMMENT_NODE_TYPES (`@/shared/lexical/node-whitelist`) —
// the editor must never produce a node the storage schema rejects; the
// contract test (tests/unit/shared/contracts/lexical-node-whitelist.test.ts)
// pins this list's types against the whitelist and
// `COMMENT_COMPOSER_NODE_TYPES`.
//
// Formulas have no dedicated node on this surface: they are authored as
// ```math code fences (the CODE_BLOCK shortcut captures the info string) and
// rendered to KaTeX MathML by the server-side comment projection
// (`computeCommentContentProjection`). The retired MathNode / MathInlineNode
// pair stays in the STORAGE whitelist so legacy bodies still validate;
// `comment-legacy-math.ts` downgrades them to the fence dialect at seed time.
//
// The QuoteNode + extended-quote replacement pair stays (blockquote is a
// comment capability); only `extended-quote` ever serializes. AutoLinkNode
// stays because CorePlugins' InklingAutoLinkPlugin is always mounted, so
// typed URLs autolink. AsideNode is filtered out (as on the page composer)
// because inkling's Ctrl+Q quote→aside→paragraph cycle would construct one —
// the comment editor captures the chord host-side before inkling sees it
// (`@/client/editor/block-quote-aside-cycle`).

import { excludeBaseNodes } from '@/client/editor/base-node-filter'
import { CodeBlockNode, EDITOR_BASE_NODES } from '@/inkling'

const COMMENT_EXCLUDED_BASE_TYPES = new Set(['heading', 'extended-heading', 'aside', 'table', 'tablerow', 'tablecell'])

const EDITOR_BASE_COMMENT = excludeBaseNodes(EDITOR_BASE_NODES, COMMENT_EXCLUDED_BASE_TYPES)

export const COMMENT_EDITOR_NODES = [...EDITOR_BASE_COMMENT, CodeBlockNode]
