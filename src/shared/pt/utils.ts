import { z } from 'zod'

import type {
  Block,
  NonRecursiveBlock,
  PortableTextBody,
  PortableTextHeading,
  PortableTextHeadingSlot,
  StandardBlockStyle,
  TextBlock,
} from '@/shared/pt/schema'

import { Slugger } from '@/shared/slug'

// --- Key generation ---------------------------------------------------------

// Generate a short opaque `_key` for a freshly-created block / span /
// markDef. Keys only need uniqueness within the body — they're not
// stable across saves. We use a 12-char `[a-z0-9]` chunk so they're
// short enough to render in DevTools without hurting readability.
//
// Falls back to `Math.random` when `crypto.getRandomValues` is missing
// (e.g. some Node test environments).
export function generateBlockKey(): string {
  const bytes = new Uint8Array(8)
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(36).padStart(2, '0')
  }
  return out.slice(0, 12)
}

// --- Headings ---------------------------------------------------------------

function tryPushHeadingSlot(block: TextBlock, out: PortableTextHeadingSlot[]): void {
  const style = block.style
  if (style === undefined || style === 'normal' || style === 'blockquote') {
    return
  }
  const depth = headingDepthFromStyle(style)
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
 * Heading blocks in **exact** render order for `PortableTextBody`:
 * top-level main column (skipping `footnoteDefinition` rows), DFS into
 * each `solution` and each `twoColumn` (left then right), then every footnote
 * definition's children in row
 * order. Matches `@portabletext/react` traversal so `_key` → anchor
 * maps stay stable across SSR and hydration without render-phase state.
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
 * Return the structured TOC entries this body would render. The slug
 * pipeline matches the one `rehype-slug` uses on MDX posts
 * path so heading anchors stay stable when a page migrates from MDX
 * into the new editor:
 *
 *   - `transform` (optional) is applied to the heading text BEFORE
 *     `Slugger`. Server-side callers pass `deriveSlug` from
 *     `@/server/slug` to romanise CJK via `pinyin-pro`. We can't
 *     import `pinyin-pro` directly here because this module ships
 *     to the client (`pt-bridge`, type re-exports), and pinyin-pro
 *     is ~150KB of CJK lookup tables.
 *   - `Slugger` then lowercases, collapses non-alphanumerics into `-`,
 *     and dedups within the same body (`foo`, `foo-1`, `foo-2`, …).
 *
 * Without `transform`, behaviour matches slugger-only output (Han
 * characters kept verbatim).
 * With it, you get the project-wide canonical slug — which is what
 * the SSR renderer wants. Order matches `collectHeadingSlotsInPortableTextRenderOrder`
 * so callers can pass `headings.map(h => h.slug)` to `<PortableTextBody>`.
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

function headingDepthFromStyle(style: StandardBlockStyle): number | null {
  switch (style) {
    case 'h1':
      return 1
    case 'h2':
      return 2
    case 'h3':
      return 3
    case 'h4':
      return 4
    case 'blockquote':
    case 'normal':
      return null
  }
}

// --- Image paths ------------------------------------------------------------

/** Walk a body and pick out every `image.storagePath` referenced. */
export function collectImageStoragePaths(body: PortableTextBody): string[] {
  const paths = new Set<string>()
  for (const block of body) {
    walkBlockForImages(block, paths)
  }
  return Array.from(paths)
}

function walkBlockForImages(block: Block, sink: Set<string>): void {
  if (block._type === 'image' && typeof block.storagePath === 'string' && block.storagePath !== '') {
    sink.add(block.storagePath)
    return
  }
  if (block._type === 'solution' || block._type === 'footnoteDefinition') {
    for (const child of block.children) {
      walkBlockForImages(child, sink)
    }
    return
  }
  if (block._type === 'twoColumn') {
    for (const child of block.left) {
      walkBlockForImages(child, sink)
    }
    for (const child of block.right) {
      walkBlockForImages(child, sink)
    }
    return
  }
}

// --- Plain text -------------------------------------------------------------

/** Plain-text projection used by search / RSS summary / OG fallback. */
export function bodyToPlainText(body: PortableTextBody): string {
  const out: string[] = []
  for (const block of body) {
    pushBlockText(block, out)
  }
  return out.join('\n').trim()
}

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
    return
  }
  if (block._type === 'solution' || block._type === 'footnoteDefinition') {
    for (const child of block.children) {
      pushBlockText(child, out)
    }
    return
  }
  if (block._type === 'twoColumn') {
    for (const child of block.left) {
      pushBlockText(child, out)
    }
    for (const child of block.right) {
      pushBlockText(child, out)
    }
    return
  }
}

// --- Validation -------------------------------------------------------------

import { portableTextBodySchema } from '@/shared/pt/schema'

/**
 * Validate an arbitrary value as a PortableText body. Throws a Zod
 * `ZodError` on failure so the caller can surface field-level errors;
 * use `safeValidatePortableTextBody` if you want a result envelope.
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
