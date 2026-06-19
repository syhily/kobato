import { use, type ReactNode } from 'react'

import type { InklingHeadingNode } from '@/shared/inkling/schema'

import { cnWithAlign } from '@/ui/inkling/render/marks/TextMark'
import { InklingHeadingIdByKeyContext } from '@/ui/inkling/render/render-shared'
import { cn } from '@/ui/lib/cn'

export function HeadingBlock({ node, children }: { node: InklingHeadingNode; children?: ReactNode }): ReactNode {
  const ids = use(InklingHeadingIdByKeyContext)
  const id = ids.get(node.key ?? '') ?? ''
  const Tag = node.tag
  return (
    <Tag id={id} className={cn('scroll-mt-20', cnWithAlign(undefined, node.format))}>
      {children}
    </Tag>
  )
}
