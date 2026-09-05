import { z } from 'zod'

import type {
  Block,
  NonRecursiveBlock,
  PortableTextBody,
  PortableTextHeading,
  PortableTextHeadingSlot,
  TextBlock,
} from '@/shared/pt/schema'

import { headingLevelFromStyle } from '@/shared/pt/heading-levels'
import { Slugger } from '@/shared/slug'

// LEGACY (R14): PortableText survives only for pre-Lexical rows until the
// R15 backfill converts them. Live consumers: `visitNestedBlocks`
// (asset-url-backfill), `bodyToPlainText` (comment email plain-text leg +
// comment dual-read), and the validate/safeValidate pair + collectors the
// R15 converter will use for row-by-row validation.

function tryPushHeadingSlot(block: TextBlock, out: PortableTextHeadingSlot[]): void {
  const depth = headingLevelFromStyle(block.style)
  if (depth === null) {
    return
  }
  const plainText = block.children
    .map((span) => span.text)
    .join('')
    .trim()
  if (plainText.length === 0) {
    return
  }
  out.push({ blockKey: block._key, plainText, depth })
}

function visitNonRecursiveForHeadings(blocks: readonly NonRecursiveBlock[], out: PortableTextHeadingSlot[]): void {
  for (const block of blocks) {
    if (block._type === 'block') {
      tryPushHeadingSlot(block, out)
    }
  }
}

/**
 * Heading blocks in exact render order for `PortableTextBody` — matched the
 * (retired) `@portabletext/react` order so `_key` → anchor maps stayed stable.
 */
export function collectHeadingSlotsInPortableTextRenderOrder(body: PortableTextBody): PortableTextHeadingSlot[] {
  const out: PortableTextHeadingSlot[] = []
  for (const block of body) {
    if (block._type === 'footnoteDefinition') {
      continue
    }
    if (block._type === 'solution') {
      visitNonRecursiveForHeadings(block.children, out)
      continue
    }
    if (block._type === 'twoColumn') {
      visitNonRecursiveForHeadings(block.left, out)
      visitNonRecursiveForHeadings(block.right, out)
      continue
    }
    if (block._type === 'block') {
      tryPushHeadingSlot(block, out)
    }
  }
  for (const block of body) {
    if (block._type === 'footnoteDefinition') {
      visitNonRecursiveForHeadings(block.children, out)
    }
  }
  return out
}

/**
 * Structured TOC entries this body renders; `transform` runs BEFORE
 * `Slugger`. pinyin-pro is not importable here — this module ships to the client.
 */
export function collectHeadings(
  body: PortableTextBody,
  transform: (text: string) => string = (text) => text,
): PortableTextHeading[] {
  const slugger = new Slugger()
  const slots = collectHeadingSlotsInPortableTextRenderOrder(body)
  return slots.map(({ depth, plainText }) => ({
    depth,
    text: plainText,
    slug: slugger.slug(transform(plainText)),
  }))
}

/**
 * Depth-first pre-order walk over a body in render order (container first, then descendants).
 * Nesting is one level deep by schema — the walk never recurses further.
 */
export function visitNestedBlocks(body: PortableTextBody, visit: (block: Block) => void): void {
  for (const block of body) {
    visit(block)
    if (block._type === 'solution' || block._type === 'footnoteDefinition') {
      for (const child of block.children) {
        visit(child)
      }
      continue
    }
    if (block._type === 'twoColumn') {
      for (const child of block.left) {
        visit(child)
      }
      for (const child of block.right) {
        visit(child)
      }
    }
  }
}

export function collectImageStoragePaths(body: PortableTextBody): string[] {
  const paths = new Set<string>()
  visitNestedBlocks(body, (block) => {
    if (block._type === 'image' && typeof block.storagePath === 'string' && block.storagePath !== '') {
      paths.add(block.storagePath)
    }
  })
  return Array.from(paths)
}

/**
 * The single collector behind both music resolution paths (SSR + feed).
 * Deduped in first-seen order.
 */
export function collectMusicPlayerIds(body: PortableTextBody): string[] {
  const ids = new Set<string>()
  visitNestedBlocks(body, (block) => {
    if (block._type === 'musicPlayer') {
      ids.add(block.playerId)
    }
  })
  return Array.from(ids)
}

/** Plain-text projection used by search / RSS summary / OG fallback. */
export function bodyToPlainText(body: PortableTextBody): string {
  const out: string[] = []
  visitNestedBlocks(body, (block) => {
    pushBlockText(block, out)
  })
  return out.join('\n').trim()
}

// Leaf-only: containers carry no text of their own.
function pushBlockText(block: Block, out: string[]): void {
  if (block._type === 'block') {
    out.push(block.children.map((span) => span.text).join(''))
    return
  }
  if (block._type === 'code') {
    out.push(block.code)
    return
  }
  if (block._type === 'mathBlock') {
    out.push(block.tex)
    return
  }
  if (block._type === 'image') {
    if (block.alt !== undefined && block.alt !== '') {
      out.push(block.alt)
    }
    return
  }
  if (block._type === 'table') {
    for (const row of block.rows) {
      for (const cell of row.cells) {
        out.push(cell.content.map((span) => span.text).join(''))
      }
    }
    return
  }
  if (block._type === 'horizontalRule') {
    out.push('---')
    return
  }
  if (block._type === 'musicPlayer') {
    out.push(`[Music: ${block.playerId}]`)
  }
}

import { portableTextBodySchema } from '@/shared/pt/schema'

/**
 * Throws a Zod `ZodError`; use `safeValidatePortableTextBody` for a
 * result envelope.
 */
export function validatePortableTextBody(value: unknown): PortableTextBody {
  return portableTextBodySchema.parse(value)
}

export function safeValidatePortableTextBody(
  value: unknown,
): { ok: true; body: PortableTextBody } | { ok: false; error: z.ZodError } {
  const result = portableTextBodySchema.safeParse(value)
  if (result.success) {
    return { ok: true, body: result.data }
  }
  return { ok: false, error: result.error }
}
