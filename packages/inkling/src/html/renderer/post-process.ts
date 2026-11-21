import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import type { LexicalNode } from 'lexical'

import { footnotesSectionPostProcessor } from '@kobato/inkling-internal/nodes/footnote/footnote-html-export'
export interface HtmlPostProcessInput {
  children: LexicalNode[]
  output: string[]
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
