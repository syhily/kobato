import type { Transformer } from '@lexical/markdown'

import { COMMENT_EDITOR_NODES } from '@kobato/inkling-internal/comment/editor/comment-editor-nodes'
import { DEFAULT_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers'

const REGISTERED_NODE_CLASSES = new Set<unknown>(COMMENT_EDITOR_NODES.filter((entry) => typeof entry === 'function'))

export const COMMENT_MARKDOWN_TRANSFORMERS: Transformer[] = DEFAULT_TRANSFORMERS.filter(
  (transformer) =>
    !('dependencies' in transformer) || transformer.dependencies.every((klass) => REGISTERED_NODE_CLASSES.has(klass)),
)
