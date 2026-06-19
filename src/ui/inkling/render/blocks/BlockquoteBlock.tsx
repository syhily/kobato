import { type ReactNode } from 'react'

import type { InklingQuoteNode } from '@/shared/inkling/schema'

import { cnWithAlign } from '@/ui/inkling/render/marks/TextMark'

export function BlockquoteBlock({ node, children }: { node: InklingQuoteNode; children?: ReactNode }): ReactNode {
  return <blockquote className={cnWithAlign(undefined, node.format)}>{children}</blockquote>
}
