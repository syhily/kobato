import { COMMENT_NODE_TYPES, FULL_EDITOR_NODE_TYPES } from '@kobato/lexical/node-whitelist.ts'

// Composer-mounted node-set manifests — a TEST-ONLY helper (no production
// consumer): the real composers mount their node lists directly, and the
// contract test below re-derives the mounted sets from those composer modules.
//
// ARTICLE mounts exactly FULL_EDITOR_NODE_TYPES, with the upstream
// text/heading/quote classes shadowed by inkling's extended replacement pairs
// and AsideNode filtered out.
//
// COMMENT mounts COMMENT_NODE_TYPES minus the math pair (formulas are ```math
// fences, rendered server-side). The STORAGE whitelist keeps `math` /
// `math-inline` so older bodies still validate; the composer downgrades them to
// the fence dialect at seed time (`comment-legacy-math`).

export const ARTICLE_COMPOSER_NODE_TYPES: readonly string[] = FULL_EDITOR_NODE_TYPES

export const COMMENT_COMPOSER_NODE_TYPES: readonly string[] = COMMENT_NODE_TYPES.filter(
  (type) => type !== 'math' && type !== 'math-inline',
)
