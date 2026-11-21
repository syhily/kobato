import type { NestedEditorSpec } from '@kobato/inkling-internal/nodes/base/card-specs'

import MINIMAL_NODES from '@kobato/inkling-internal/nodes/MinimalNodes'

export const captionEditorSpecBase = {
  name: 'captionEditor',
  serializedKey: 'caption',
  nodes: MINIMAL_NODES,
} as const satisfies NestedEditorSpec
