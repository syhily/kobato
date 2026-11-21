import { COMMENT_NODE_TYPES, FULL_EDITOR_NODE_TYPES } from '@kobato/inkling/headless/node-whitelist.ts'

export const ARTICLE_COMPOSER_NODE_TYPES: readonly string[] = FULL_EDITOR_NODE_TYPES

export const COMMENT_COMPOSER_NODE_TYPES: readonly string[] = COMMENT_NODE_TYPES.filter(
  (type) => type !== 'math' && type !== 'math-inline',
)
