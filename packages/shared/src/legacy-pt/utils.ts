import type {
  Block,
  NonRecursiveBlock,
  PortableTextBody,
  PortableTextHeading,
  PortableTextHeadingSlot,
  TextBlock,
} from '@kobato/shared/legacy-pt/schema'

import { headingLevelFromStyle } from '@kobato/shared/legacy-pt/heading-levels'
import { Slugger } from '@kobato/shared/slug'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { z } from 'zod'

// --- Key generation ---------------------------------------------------------

// Generate a short opaque `_key` for a freshly-created block / span /
// markDef. Keys only need uniqueness within the body — they're not
// stable across saves. Falls back to `Math.random` when
// `crypto.getRandomValues` is missing (e.g. some Node test environments).
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
 * Heading blocks in **exact** render order for `PortableTextBody`:
 * top-level main column (skipping `footnoteDefinition` rows), DFS into
 * each `solution` and each `twoColumn` (left then right), then every
 * footnote definition's children in row order. Matches
 * `@portabletext/react` traversal so `_key` → anchor maps stay stable
 * across SSR and hydration without render-phase state.
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
 * pipeline matches what `rehype-slug` produced on MDX posts, so heading
 * anchors stayed stable when content migrated from MDX into the editor:
 *
 *   - `transform` (optional) is applied to the heading text BEFORE
 *     `Slugger`. Server-side callers pass `deriveSlug` from
 *     `@/server/infra/slug/derive` to romanise CJK via `pinyin-pro` — it can't be
 *     imported here because this module ships to the client and
 *     pinyin-pro is ~150KB of CJK lookup tables.
 *   - `Slugger` then lowercases, collapses non-alphanumerics into `-`,
 *     and dedups within the same body (`foo`, `foo-1`, `foo-2`, …).
 *
 * Order matches `collectHeadingSlotsInPortableTextRenderOrder` so callers
 * can pass `headings.map(h => h.slug)` to `<PortableTextBody>`.
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
 * Zip the heading slots of a body with precomputed slugs into a
 * `_key → anchor id` map — the single owner of the slots→slug zip used
 * by BOTH render adapters (feed HTML and React tree), so the two can
 * never drift into different id assignment.
 *
 * Slot `i` takes `headingSlugs[i]` when that entry is a non-empty string;
 * otherwise `fallbackSlug` derives an id from the heading's plain text.
 * The fallback legitimately differs per adapter (pinyin-aware on the feed
 * renderer, client-safe `Slugger` in the React tree), so it stays a
 * parameter.
 */
export function buildHeadingIdByBlockKey(
  body: PortableTextBody,
  headingSlugs: readonly string[] | undefined,
  fallbackSlug: (plainText: string) => string,
): Map<string, string> {
  const slots = collectHeadingSlotsInPortableTextRenderOrder(body)
  const map = new Map<string, string>()
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i]
    const pre = headingSlugs?.[i]
    const id = typeof pre === 'string' && pre.length > 0 ? pre : fallbackSlug(slot.plainText)
    map.set(slot.blockKey, id)
  }
  return map
}

// --- Nested traversal -------------------------------------------------------

/**
 * Depth-first walk over a PortableText body in render order (pre-order:
 * container first, then its descendants). The schema's nesting rules live
 * here exactly once; collectors (image paths, code/math pre-render, music
 * players, image sync) are callbacks that filter by `_type`. Nesting is
 * one level deep by schema, so the walk cannot recurse further.
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

/**
 * Mapping counterpart of `visitNestedBlocks` — same nesting rules, same
 * pre-order. The callback MUST preserve each position's block kind: a
 * nested block has to map to a `NonRecursiveBlock` (nesting is one level
 * deep by schema). Every block is mapped exactly once; the result is
 * always a new array with new container objects, while untouched leaves
 * keep their identity.
 */
export function mapNestedBlocks(body: PortableTextBody, map: (block: Block) => Block): PortableTextBody {
  // The callback contract guarantees a nested position maps back to a
  // NonRecursiveBlock (the schema forbids deeper nesting).
  const mapChild = (child: NonRecursiveBlock): NonRecursiveBlock => unsafeCast<NonRecursiveBlock>(map(child))
  return body.map((block) => {
    const mapped = map(block)
    if (mapped._type === 'solution' || mapped._type === 'footnoteDefinition') {
      return { ...mapped, children: mapped.children.map(mapChild) }
    }
    if (mapped._type === 'twoColumn') {
      return { ...mapped, left: mapped.left.map(mapChild), right: mapped.right.map(mapChild) }
    }
    return mapped
  })
}

// --- Image paths ------------------------------------------------------------

/** Walk a body and pick out every `image.storagePath` referenced. */
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
 * Walk a body and pick out every `musicPlayer.playerId` referenced,
 * deduped in first-seen order. The single collector behind both music
 * resolution paths — SSR enrichment and feed rendering — which then call
 * the single fetch seam `getPublicMusicMetasByIds`.
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

// --- Plain text -------------------------------------------------------------

/** Plain-text projection used by search / RSS summary / OG fallback. */
export function bodyToPlainText(body: PortableTextBody): string {
  const out: string[] = []
  visitNestedBlocks(body, (block) => {
    pushBlockText(block, out)
  })
  return out.join('\n').trim()
}

// Leaf projection callback for `visitNestedBlocks` — containers carry no
// text of their own, so only leaf blocks push.
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
}

// --- Validation -------------------------------------------------------------

import { portableTextBodySchema } from '@kobato/shared/legacy-pt/schema'

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
