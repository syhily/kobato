import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { Block, ImageBlock, PortableTextBody } from '@/shared/pt/schema'

import { getPublicBaseUrl } from '@/server/domains/images/storage'
import { findImagesByIds, updateImageNote } from '@/server/infra/db/operations/image'
import { idFromString } from '@/shared/utils/id'

// Two-step sync for `image` blocks at save time.
//
//   1. Library blocks (`imageId !== undefined`) — re-resolve
//      `storagePath` / `width` / `height` / `thumbhash` / `src` from
//      the canonical `image` row so the body stays in lockstep with
//      the media library. Also write back to the row when the
//      operator edited `alt` (`image.note`) inside the editor —
//      this is the "edit alt updates the table" half of the brief.
//
//   2. External blocks (`imageId === undefined`) — leave alone. The
//      `src` is a third-party URL; we don't fetch its bytes, don't
//      compute a thumbhash, and don't add it to the revision's
//      `image_sources` projection (the existing
//      `collectImageStoragePaths` already skips blocks without a
//      `storagePath`, so nothing extra to do here).
//
// Mutates the passed body in place. Failures are swallowed —
// canonicalising a single block isn't worth blocking the save.
export async function syncLibraryImageBlocks(db: NodePgDatabase, body: PortableTextBody): Promise<void> {
  const targets: ImageBlock[] = []
  for (const block of body) {
    collectImageBlocks(block, targets)
  }
  if (targets.length === 0) {
    return
  }

  // Batch-resolve imageIds to bigint ids so we can fetch all rows in one query.
  const idTargets: { id: bigint; target: ImageBlock }[] = []
  for (const target of targets) {
    if (target.imageId === undefined || target.imageId === '') {
      continue
    }
    try {
      idTargets.push({ id: idFromString(target.imageId), target })
    } catch {
      // ignore malformed imageId
    }
  }
  if (idTargets.length === 0) {
    return
  }

  const rows = await findImagesByIds(
    db,
    idTargets.map((t) => t.id),
  )
  const byId = new Map(rows.map((r) => [r.id, r]))

  for (const { id, target } of idTargets) {
    const row = byId.get(id)
    if (row === undefined) {
      continue
    }
    target.storagePath = row.storagePath
    target.width = row.width ?? target.width
    target.height = row.height ?? target.height
    if (row.thumbhash !== null && row.thumbhash !== undefined && row.thumbhash !== '') {
      target.thumbhash = row.thumbhash
    }
    // Keep `src` in sync with the bucket's canonical public URL so
    // the body still renders even when the SSR enhancer can't run.
    const base = getPublicBaseUrl()
    if (base !== null) {
      target.src = `${base}/${row.storagePath}`
    }
    // Write `alt` back into the row when the operator edited it.
    const nextNote = (target.alt ?? '').trim()
    if (nextNote !== (row.note ?? '')) {
      await updateImageNote(db, row.id, nextNote === '' ? null : nextNote).catch(() => undefined)
    }
  }
}

function collectImageBlocks(block: Block, out: ImageBlock[]): void {
  if (block._type === 'image') {
    out.push(block)
    return
  }
  if (block._type === 'solution' || block._type === 'footnoteDefinition') {
    for (const child of block.children) {
      collectImageBlocks(child, out)
    }
    return
  }
  if (block._type === 'twoColumn') {
    for (const child of block.left) {
      collectImageBlocks(child, out)
    }
    for (const child of block.right) {
      collectImageBlocks(child, out)
    }
    return
  }
}
