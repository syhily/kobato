// Every mounted type must stay inside COMMENT_NODE_TYPES
// (`@kobato/lexical/node-whitelist`): the editor must never produce a node the
// storage schema rejects. `packages/web/tests/contract/lexical-node-whitelist.test.ts`
// pins the list against the whitelist and COMMENT_COMPOSER_NODE_TYPES.
//
// Formulas are ```math code fences (the CODE_BLOCK shortcut captures the info
// string) rendered to KaTeX MathML by the server-side comment projection.
// MathNode/MathInlineNode stay in the storage whitelist so legacy bodies still
// validate; `comment-legacy-math.ts` rewrites them at seed time.
//
// QuoteNode keeps its extended-quote replacement pair (blockquote is a comment
// capability; only `extended-quote` serializes). AutoLinkNode stays because
// InklingAutoLinkPlugin is always mounted. AsideNode is excluded because
// inkling's Ctrl+Q cycle would construct one; the chord is captured host-side
// (`block-quote-aside-cycle`).

import { CodeBlockNode, EDITOR_BASE_NODES } from '@kobato/inkling'
import { excludeBaseNodes } from '@kobato/web/client/editor/base-node-filter.ts'

const COMMENT_EXCLUDED_BASE_TYPES = new Set(['heading', 'extended-heading', 'aside', 'table', 'tablerow', 'tablecell'])

const EDITOR_BASE_COMMENT = excludeBaseNodes(EDITOR_BASE_NODES, COMMENT_EXCLUDED_BASE_TYPES)

export const COMMENT_EDITOR_NODES = [...EDITOR_BASE_COMMENT, CodeBlockNode]
