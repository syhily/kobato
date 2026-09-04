import type { Database } from '@/server/infra/db/database'
import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'

import { findImagesByIds, updateImageNote } from '@/server/infra/db/operations/image'
import { visitLexicalNodes } from '@/shared/lexical/walk'
import { idFromString } from '@/shared/utils/id'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Two-step sync for `image` nodes at save time (Lexical counterpart of the
// PT block sync, plan round R9a). Library nodes re-resolve from the
// canonical `image` row and write back `alt`; external nodes are left
// alone. Failures are swallowed.

interface ImageNodeView extends LexicalNodeJson {
  src: string
  alt: string
  width: number | null
  height: number | null
  thumbhash?: string
  storagePath?: string
  imageId?: string
}

export async function syncLibraryImageBlocks(db: Database, state: LexicalEditorState): Promise<void> {
  const targets: ImageNodeView[] = []
  visitLexicalNodes(state, (node) => {
    if (node.type === 'image') {
      // The schema pins the image dataset shape; the view exposes the fields this pass mutates.
      targets.push(unsafeCast<ImageNodeView>(node))
    }
  })
  if (targets.length === 0) {
    return
  }

  const idTargets: { id: number; target: ImageNodeView }[] = []
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
    // Site-owned form: content stores the origin-relative `/storage/<key>` so a
    // backend/CDN switch never breaks stored bodies; renderers absolutize.
    target.src = `/storage/${row.storagePath}`
    const nextNote = target.alt.trim()
    if (nextNote !== (row.note ?? '')) {
      await updateImageNote(db, row.id, nextNote === '' ? null : nextNote).catch(() => undefined)
    }
  }
}
