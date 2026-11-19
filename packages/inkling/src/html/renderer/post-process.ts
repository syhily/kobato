import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import type { LexicalNode } from 'lexical'

import { footnotesSectionPostProcessor } from '@kobato/inkling-internal/nodes/footnote/footnote-html-export'
export interface HtmlPostProcessInput {
  children: LexicalNode[]
  output: string[]
  /**
   * Child-index → output-index map, kept current through the
   * trailing-blank-paragraph suppression: `outputIndexByChild[i]` is the
   * index in `output` of child i's fragment, or -1 when the child produced
   * none (a null export, or removal by the suppression). Children and output
   * indices diverge because a child can export null, so a processor MUST
   * resolve output positions through this map and never assume one output
   * entry per child. INVARIANT: a node claimed via `isTrailingRunNode` must
   * export non-null — then a claimed doc-end run maps to the contiguous tail
   * of `output` starting at the run's first mapped index.
   */
  outputIndexByChild: number[]

  context: RenderContext
}

export interface HtmlPostProcessor {
  isTrailingRunNode?(node: LexicalNode): boolean

  process(input: HtmlPostProcessInput): void
}

export const HTML_POST_PROCESSORS: HtmlPostProcessor[] = [footnotesSectionPostProcessor]

export function isTrailingRunNode(node: LexicalNode): boolean {
  return HTML_POST_PROCESSORS.some((processor) => processor.isTrailingRunNode?.(node) === true)
}
