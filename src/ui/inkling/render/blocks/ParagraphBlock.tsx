import { type ReactNode } from 'react'

import type { InklingParagraphNode } from '@/shared/inkling/schema'

import { cnWithAlign } from '@/ui/inkling/render/marks/TextMark'

export function ParagraphBlock({ node, children }: { node: InklingParagraphNode; children?: ReactNode }): ReactNode {
  return <p className={cnWithAlign(undefined, node.format)}>{children}</p>
}
