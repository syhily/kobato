import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { InklingBlockNode, InklingDocument, InklingImageCardNode } from '@/shared/inkling/schema'

import { findImagesByIds, updateImageNote } from '@/server/infra/db/operations/image'
import { getPublicBaseUrl } from '@/server/infra/storage/public-url'
import { idFromString } from '@/shared/utils/id'

// Two-step sync for `image-card` blocks at save time.
//
//   1. Library blocks (`imageId !== undefined`) — re-resolve
//      `storagePath` / `width` / `height` / `thumbhash` / `src` from
//      the canonical `image` row so the body stays in lockstep with
//      the media library. Also write back to the row when the operator
//      edited `alt` (`image.note`) inside the editor.
//
//   2. External blocks (`imageId === undefined`) — leave alone. The
//      `src` is a third-party URL; we don't fetch its bytes, don't
//      compute a thumbhash, and don't add it to the revision's
//      `image_sources` projection.
//
// Mutates the passed document in place. Failures are swallowed —
// canonicalising a single block isn't worth blocking the save.
export async function syncLibraryImageBlocks(db: NodePgDatabase, document: InklingDocument): Promise<void> {
  const targets: InklingImageCardNode[] = []
  for (const block of document.root.children) {
    collectImageCards(block, targets)
  }
  if (targets.length === 0) {
    return
  }

  // Batch-resolve imageIds to bigint ids so we can fetch all rows in one query.
  const idTargets: { id: bigint; target: InklingImageCardNode }[] = []
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

function collectImageCards(block: InklingBlockNode, out: InklingImageCardNode[]): void {
  if (block.type === 'image-card') {
    out.push(block)
    return
  }
  if (block.type === 'solution' || block.type === 'footnote-definition') {
    for (const child of block.children) {
      collectImageCards(child, out)
    }
    return
  }
  if (block.type === 'two-column') {
    for (const child of block.left) {
      collectImageCards(child, out)
    }
    for (const child of block.right) {
      collectImageCards(child, out)
    }
    return
  }
}
