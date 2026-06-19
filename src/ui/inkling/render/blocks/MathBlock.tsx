import { type ReactNode } from 'react'

import type { InklingMathBlockNode } from '@/shared/inkling/schema'

import { renderMathMarkupOrTexFallback } from '@/ui/inkling/render/marks/MathMark'

export function MathBlock({ node }: { node: InklingMathBlockNode }): ReactNode {
  return renderMathMarkupOrTexFallback(node.tex, node.mathml, 'display')
}
