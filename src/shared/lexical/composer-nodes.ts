import { COMMENT_NODE_TYPES, FULL_EDITOR_NODE_TYPES } from '@/shared/lexical/node-whitelist'

// Composer-mounted node-set manifests (plan
// docs/plans/inkling-editor-replacement.md, R7 contract-test requirement).
//
// ARTICLE is the R11 truth: the page/article composer mounts exactly
// FULL_EDITOR_NODE_TYPES (core-registered paragraph/linebreak + the
// configured classes in `@/client/editor/page-editor-nodes`, with the
// upstream text/heading/quote classes shadowed by inkling's extended
// replacement pairs and AsideNode filtered out). The contract test
// (tests/unit/shared/contracts/lexical-node-whitelist.test.ts) re-derives
// the mounted set from the real composer module and pins the three-way
// schema ⇐ whitelist ⇐ composer identity.
//
// COMMENT stays a placeholder mirror until the R12 comment composer lands.

export const ARTICLE_COMPOSER_NODE_TYPES: readonly string[] = FULL_EDITOR_NODE_TYPES

export const COMMENT_COMPOSER_NODE_TYPES: readonly string[] = COMMENT_NODE_TYPES
