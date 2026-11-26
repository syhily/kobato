import type { Transformer } from '@kobato/inkling'

import { DEFAULT_TRANSFORMERS } from '@kobato/inkling'
import { COMMENT_EDITOR_NODES } from '@kobato/web-kit/ui/comments/editor/comment-editor-nodes'

const REGISTERED_NODE_CLASSES = new Set<unknown>(COMMENT_EDITOR_NODES.filter((entry) => typeof entry === 'function'))

export const COMMENT_MARKDOWN_TRANSFORMERS: Transformer[] = DEFAULT_TRANSFORMERS.filter(
  (transformer) =>
    !('dependencies' in transformer) || transformer.dependencies.every((klass) => REGISTERED_NODE_CLASSES.has(klass)),
)
