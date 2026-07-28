import type { Database } from '@/server/infra/db/database'
import type { ImageBlock, PortableTextBody } from '@/shared/pt/schema'

import { findImagesByIds, updateImageNote } from '@/server/infra/db/operations/image'
import { getPublicBaseUrl } from '@/server/infra/storage/public-url'
import { visitNestedBlocks } from '@/shared/pt/utils'
import { idFromString } from '@/shared/utils/id'

// Two-step sync for `image` blocks at save time. Library blocks
// (`imageId !== undefined`) re-resolve `storagePath` / dims / thumbhash /
// `src` from the canonical `image` row, and write back `alt` edits to
// `image.note`. External blocks are left alone (third-party `src`; never
// fetched or projected). Mutates the body in place; failures are
// swallowed — canonicalising a single block isn't worth blocking the save.
export async function syncLibraryImageBlocks(db: Database, body: PortableTextBody): Promise<void> {
  const targets: ImageBlock[] = []
  visitNestedBlocks(body, (block) => {
    if (block._type === 'image') {
      targets.push(block)
    }
  })
  if (targets.length === 0) {
    return
  }

  // Batch-resolve imageIds to bigint ids so we can fetch all rows in one query.
  const idTargets: { id: number; target: ImageBlock }[] = []
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
