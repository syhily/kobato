// The string layer's post-processing seam: after `$convertToHtmlString`
// assembles the top-level outputs, each registered processor gets one
// declarative pass over them. Subsystems own their post-render policy here
// instead of the string layer hardcoding per-subsystem specials — the
// footnotes `<section>` wrap (the first, and the reason the seam exists)
// lives in `@/inkling/nodes/footnote/footnote-html-export`.
//
// A processor may also claim a doc-end trailing run (`isTrailingRunNode`):
// the string layer's trailing-blank-paragraph suppression walks past the
// claimed nodes, so a subsystem's doc-end run never strands the blank
// paragraph the editor keeps. Processors run in registry order after the
// suppression.

import type { LexicalNode } from 'lexical'

import type { RenderContext } from '@/inkling/nodes/base/render-context'

import { footnotesSectionPostProcessor } from '@/inkling/nodes/footnote/footnote-html-export'

export interface HtmlPostProcessInput {
  /** The root children this render exported. */
  children: LexicalNode[]
  /** The assembled top-level HTML fragments — a processor splices/wraps in place. */
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
  /** The render pass's read-only context (policy resolution, escaping). */
  context: RenderContext
}

export interface HtmlPostProcessor {
  /**
   * Claims the nodes of this processor's doc-end trailing run. The
   * trailing-blank-paragraph suppression walks back past claimed nodes to
   * the last prose element before deciding to drop it.
   */
  isTrailingRunNode?(node: LexicalNode): boolean
  /** One post-assembly pass over the outputs. */
  process(input: HtmlPostProcessInput): void
}

/** The default post-processor set, in run order. */
export const HTML_POST_PROCESSORS: HtmlPostProcessor[] = [footnotesSectionPostProcessor]

/** The trailing-run predicate composed over the registered processors. */
export function isTrailingRunNode(node: LexicalNode): boolean {
  return HTML_POST_PROCESSORS.some((processor) => processor.isTrailingRunNode?.(node) === true)
}
