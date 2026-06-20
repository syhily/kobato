import { type ReactNode } from 'react'

import { sanitizeUrl } from '@/shared/sanitize-url'
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
  // Defense-in-depth: shared protocol whitelist + control-character
  // stripping.  Replaces the previous ad-hoc `/^\s*(javascript|data):/i`
  // regex which missed vbscript: and was bypassable via control chars.
  const href = sanitizeUrl(url)
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
