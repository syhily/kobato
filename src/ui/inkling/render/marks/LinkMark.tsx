import { type ReactNode } from 'react'

import { INKLING_INLINE } from '@/ui/inkling/render/render-shared'
import { safeRel } from '@/ui/lib/link'

export interface LinkMarkProps {
  url: string
  target?: string | null
  rel?: string | null
  title?: string | null
  children: ReactNode
}

export function LinkMark({ url, target, rel, title, children }: LinkMarkProps): ReactNode {
  // Defense-in-depth: never emit executable JavaScript or data URLs
  // even if the schema filter is somehow bypassed.
  const href = /^\s*(javascript|data):/i.test(url) ? '#' : url
  return (
    <a
      href={href}
      rel={safeRel(target, rel)}
      target={target ?? undefined}
      title={title ?? undefined}
      className={INKLING_INLINE.link}
    >
      {children}
    </a>
  )
}
