import { COMMENT_NODE_TYPES, FULL_EDITOR_NODE_TYPES } from '@/shared/lexical/node-whitelist'

// R7 placeholder for the composer-mounted node sets (plan
// docs/plans/inkling-editor-replacement.md, R7 contract-test requirement).
// The article/comment composers land in R11/R12 (milestones M3/M4); until
// then these manifests mirror the whitelist constants so the contract test
// (tests/unit/shared/contracts/lexical-node-whitelist.test.ts) pins both
// sides to the single source. R11 MUST replace the values with the node
// types the composers actually mount — derived from the composer node
// configs, which must in turn consume the node-whitelist constants — and
// the contract test then pins schema ⇐ whitelist ⇐ composer three ways.

export const ARTICLE_COMPOSER_NODE_TYPES: readonly string[] = FULL_EDITOR_NODE_TYPES

export const COMMENT_COMPOSER_NODE_TYPES: readonly string[] = COMMENT_NODE_TYPES
