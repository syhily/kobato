import { type ReactNode } from 'react'

import { FootnoteReference } from '@/ui/pt/Footnotes'

export interface FootnoteRefMarkProps {
  index: number
}

export function FootnoteRefMark({ index }: FootnoteRefMarkProps): ReactNode {
  return (
    <FootnoteReference id={`user-content-fnref-${index}`} data-footnote-ref="">
      <a href={`#user-content-fn-${index}`} className="footnote-ref">
        {index}
      </a>
    </FootnoteReference>
  )
}
