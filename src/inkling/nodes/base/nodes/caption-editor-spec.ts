import type { NestedEditorSpec } from '@/inkling/nodes/base/card-specs'

import MINIMAL_NODES from '@/inkling/nodes/MinimalNodes'

/**
 * The shared core of the five captioned cards' `captionEditor` nested-editor
 * spec entry (codeblock, bookmark, image, gallery, video) — a `captionEditor`
 * over the `caption` property with the minimal node set. Per-card variance is
 * plain data composed by spread at the spec-array site (the card's base node
 * module): `nullable: true` for the cards the markdown round-trip detaches
 * (gallery and video), `cleanBasicHtml` for image's first-child-inner-content
 * serialization.
 *
 * The MINIMAL_NODES import runs against the layer grain (`nodes/` root from
 * `nodes/base/nodes/`) but closes no cycle: MINIMAL_NODES composes only base
 * leaves (TKNode, the extended-text pair), the same direction
 * `generate-decorator-node` already depends on through `nodes/nested-editors`.
 */
export const captionEditorSpecBase = {
  name: 'captionEditor',
  serializedKey: 'caption',
  nodes: MINIMAL_NODES,
} as const satisfies NestedEditorSpec
