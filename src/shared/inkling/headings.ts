import type { InklingDocument } from '@/shared/inkling/schema'

import { walkInkling } from '@/shared/inkling/walk'
import { Slugger } from '@/shared/slug'

export interface InklingHeading {
  depth: number
  text: string
  slug: string
}

export interface InklingHeadingSlot {
  blockKey: string
  plainText: string
}

interface HeadingCtx {
  textParts: string[]
  depth: number | null
  insideHeading: boolean
  headings: InklingHeading[]
}

interface HeadingSlotCtx {
  textParts: string[]
  blockKey: string | null
  insideHeading: boolean
  slots: InklingHeadingSlot[]
}

function headingDepthFromTag(tag: string): number | null {
  switch (tag) {
    case 'h1':
      return 1
    case 'h2':
      return 2
    case 'h3':
      return 3
    case 'h4':
      return 4
    default:
      return null
  }
}

export function collectInklingHeadings(
  document: InklingDocument,
  transform: (text: string) => string = (text) => text,
): InklingHeading[] {
  const slugger = new Slugger()
  const ctx: HeadingCtx = { textParts: [], depth: null, insideHeading: false, headings: [] }

  walkInkling(
    document,
    {
      heading: (node, c, walkChildren) => {
        c.depth = headingDepthFromTag(node.tag)
        c.insideHeading = true
        walkChildren()
        c.insideHeading = false
        const text = c.textParts.join('').trim()
        c.textParts = []
        if (text.length > 0 && c.depth !== null) {
          c.headings.push({
            depth: c.depth,
            text,
            slug: slugger.slug(transform(text)),
          })
        }
        c.depth = null
      },
      text: (node, c) => {
        if (c.insideHeading) {
          c.textParts.push(node.text)
        }
      },
      linebreak: (_, c) => {
        if (c.insideHeading) {
          c.textParts.push('\n')
        }
      },
      inlineMath: (node, c) => {
        if (c.insideHeading) {
          c.textParts.push(node.tex)
        }
      },
      link: (_, c, walkChildren) => {
        if (c.insideHeading) {
          walkChildren()
        }
      },
    },
    ctx,
  )

  return ctx.headings
}

/**
 * Collect heading slots in render order so SSR renderers can zip them with
 * pre-computed slugs. Returns the heading block key and plain text for each
 * heading; this mirrors `collectHeadingSlotsInPortableTextRenderOrder` for the
 * Inkling document shape.
 */
export function collectInklingHeadingSlots(document: InklingDocument): InklingHeadingSlot[] {
  const ctx: HeadingSlotCtx = { textParts: [], blockKey: null, insideHeading: false, slots: [] }

  walkInkling(
    document,
    {
      heading: (node, c, walkChildren) => {
        c.blockKey = node.key ?? ''
        c.insideHeading = true
        walkChildren()
        c.insideHeading = false
        const plainText = c.textParts.join('').trim()
        c.textParts = []
        if (plainText.length > 0 && c.blockKey !== '') {
          c.slots.push({ blockKey: c.blockKey, plainText })
        }
        c.blockKey = null
      },
      text: (node, c) => {
        if (c.insideHeading) {
          c.textParts.push(node.text)
        }
      },
      linebreak: (_, c) => {
        if (c.insideHeading) {
          c.textParts.push('\n')
        }
      },
      inlineMath: (node, c) => {
        if (c.insideHeading) {
          c.textParts.push(node.tex)
        }
      },
      link: (_, c, walkChildren) => {
        if (c.insideHeading) {
          walkChildren()
        }
      },
    },
    ctx,
  )

  return ctx.slots
}
