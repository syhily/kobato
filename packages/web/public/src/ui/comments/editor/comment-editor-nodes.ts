import { CodeBlockNode, EDITOR_BASE_NODES } from '@kobato/inkling'
import { excludeBaseNodes } from '@kobato/web-client/editor/base-node-filter'

const COMMENT_EXCLUDED_BASE_TYPES = new Set(['heading', 'extended-heading', 'aside', 'table', 'tablerow', 'tablecell'])

const EDITOR_BASE_COMMENT = excludeBaseNodes(EDITOR_BASE_NODES, COMMENT_EXCLUDED_BASE_TYPES)

export const COMMENT_EDITOR_NODES = [...EDITOR_BASE_COMMENT, CodeBlockNode]
