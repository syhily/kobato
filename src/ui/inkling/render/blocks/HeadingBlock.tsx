import { use, type ReactNode } from 'react'

import type { InklingHeadingNode } from '@/shared/inkling/schema'

import { cnWithAlign } from '@/ui/inkling/render/marks/TextMark'
import { InklingHeadingIdByKeyContext } from '@/ui/inkling/render/render-shared'
import { cn } from '@/ui/lib/cn'

export function HeadingBlock({ node, children }: { node: InklingHeadingNode; children?: ReactNode }): ReactNode {
  const ids = use(InklingHeadingIdByKeyContext)
  const id = ids.get(node.key ?? '') ?? ''
  const Tag = node.tag
  // Render `id` only when non-empty. An empty id would (a) be invalid HTML
  // and (b) collide across multiple symbol/emoji-only headings (which
  // `collectInklingHeadingSlots` skips, leaving no entry in `ids`). Omitting
  // the attribute entirely keeps the DOM well-formed and avoids duplicate-id
  // warnings. The InklingBody builder always synthesises a stable
  // `heading-{i}` fallback, so in practice this is belt-and-braces.
  return (
    <Tag id={id.length > 0 ? id : undefined} className={cn('scroll-mt-20', cnWithAlign(undefined, node.format))}>
      {children}
    </Tag>
  )
}
