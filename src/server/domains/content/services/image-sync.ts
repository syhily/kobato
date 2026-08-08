import type { Database } from '@/server/infra/db/database'
import type { ImageBlock, PortableTextBody } from '@/shared/pt/schema'

import { findImagesByIds, updateImageNote } from '@/server/infra/db/operations/image'
import { getPublicBaseUrl } from '@/server/infra/storage/public-url'
import { visitNestedBlocks } from '@/shared/pt/utils'
import { idFromString } from '@/shared/utils/id'

// Two-step sync for `image` blocks at save time. Library blocks
// re-resolve from the canonical `image` row and write back `alt`;
// external blocks are left alone. Failures are swallowed.
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
    // Keep `src` at the bucket's canonical public URL so the body renders without the SSR enhancer.
    const base = getPublicBaseUrl()
    if (base !== null) {
      target.src = `${base}/${row.storagePath}`
    }
    const nextNote = (target.alt ?? '').trim()
    if (nextNote !== (row.note ?? '')) {
      await updateImageNote(db, row.id, nextNote === '' ? null : nextNote).catch(() => undefined)
    }
  }
}
