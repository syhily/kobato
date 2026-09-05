import type { LexicalEditor } from 'lexical'

import type { CleanBasicHtmlOptions } from '@/html/clean-basic-html'
import type { NestedEditorSpec, NestedEditorValueCarrier } from '@/nodes/base/card-specs'

import MINIMAL_NODES from '@/nodes/MinimalNodes'

/**
 * The shared caption nested-editor spec entry (the five captioned cards':
 * codeblock, bookmark, image, gallery, video) — a `captionEditor` over the
 * `caption` property with the minimal node set. Per-card variance is data:
 * `nullable` for the cards the markdown round-trip detaches (gallery and
 * video, riding the same type-level carrier as `nullableNestedEditor`), and
 * `cleanBasicHtml` for image's first-child-inner-content serialization.
 * Lives in the cards layer rather than beside `nullableNestedEditor` in the
 * generator: the generator must not import MINIMAL_NODES — that would close
 * a cycle through `@/nodes/base/nodes`.
 */
export function captionEditorSpec(options: {
  nullable: true
  cleanBasicHtml?: CleanBasicHtmlOptions
}): NestedEditorSpec & { name: 'captionEditor' } & NestedEditorValueCarrier<LexicalEditor | null>
export function captionEditorSpec(options?: {
  cleanBasicHtml?: CleanBasicHtmlOptions
}): NestedEditorSpec & { name: 'captionEditor' }
export function captionEditorSpec(options?: {
  nullable?: boolean
  cleanBasicHtml?: CleanBasicHtmlOptions
}): NestedEditorSpec & { name: 'captionEditor' } {
  return {
    name: 'captionEditor',
    serializedKey: 'caption',
    nodes: MINIMAL_NODES,
    ...(options?.cleanBasicHtml ? { cleanBasicHtml: options.cleanBasicHtml } : {}),
  } as NestedEditorSpec & { name: 'captionEditor' }
}
