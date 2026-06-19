import { Fragment, type ReactNode } from 'react'

import { INKLING_INLINE } from '@/ui/inkling/render/render-shared'
import { cn } from '@/ui/lib/cn'

// Lexical text format bits (from lexical package source).
const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_UNDERLINE = 4
const FORMAT_CODE = 8
const FORMAT_STRIKETHROUGH = 16

export interface TextMarkProps {
  text: string
  format?: number
}

function textWithLineBreaks(text: string): ReactNode {
  const parts = text.split('\n')
  if (parts.length === 1) {
    return text
  }
  let offset = 0
  return parts.map((part, index) => {
    const key = `line-${offset}-${part.slice(0, 16)}`
    const node = (
      <Fragment key={key}>
        {part}
        {index < parts.length - 1 ? <br /> : null}
      </Fragment>
    )
    offset += part.length + 1
    return node
  })
}

export function TextMark({ text, format = 0 }: TextMarkProps): ReactNode {
  let node: ReactNode = textWithLineBreaks(text)
  if ((format & FORMAT_BOLD) !== 0) {
    node = <strong className={INKLING_INLINE.strong}>{node}</strong>
  }
  if ((format & FORMAT_ITALIC) !== 0) {
    node = <em className={INKLING_INLINE.em}>{node}</em>
  }
  if ((format & FORMAT_UNDERLINE) !== 0) {
    node = <u className={INKLING_INLINE.underline}>{node}</u>
  }
  if ((format & FORMAT_STRIKETHROUGH) !== 0) {
    node = <s className={INKLING_INLINE.strike}>{node}</s>
  }
  if ((format & FORMAT_CODE) !== 0) {
    node = <code className={INKLING_INLINE.code}>{node}</code>
  }
  return node
}

export function alignClass(align: string | number | undefined): string | undefined {
  if (align === 'center' || align === 1) {
    return 'text-center'
  }
  if (align === 'right' || align === 2) {
    return 'text-right'
  }
  if (align === 'left' || align === 3) {
    return 'text-left'
  }
  return undefined
}

export function cnWithAlign(base: string | undefined, align: string | number | undefined): string | undefined {
  return cn(base, alignClass(align))
}
