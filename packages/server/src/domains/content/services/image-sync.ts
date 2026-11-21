import type { Database } from '@kobato/db/database'
import type { LexicalEditorState, LexicalNodeJson } from '@kobato/inkling/headless/schema'

import { findImagesByIds, updateImageNote } from '@kobato/db/operations/image'
import { visitLexicalNodes } from '@kobato/inkling/headless/walk'
import { idFromString } from '@kobato/utils/id'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

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
    } catch {}
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
    target.src = `/storage/${row.storagePath}`
    const nextNote = target.alt.trim()
    if (nextNote !== (row.note ?? '')) {
      await updateImageNote(db, row.id, nextNote === '' ? null : nextNote).catch(() => undefined)
    }
  }
}
