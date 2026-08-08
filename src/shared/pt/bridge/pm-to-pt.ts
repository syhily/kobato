import type { PmDoc } from '@/shared/pt/bridge/types'
import type { Block, PortableTextBody } from '@/shared/pt/schema'

import { dispatchPmNodeToBlocks } from '@/shared/pt/bridge/node-registry'
import { synchronizeFootnoteIndices } from '@/shared/pt/footnote-sync'

/** Convert a PM `doc` back to a PortableText body — the save path; unknown node types throw instead of being dropped. */
export function pmDocToBody(doc: PmDoc): PortableTextBody {
  const out: Block[] = []
  let nextKey = 0
  const ensureKey = (attrs: Record<string, unknown> | undefined): string => {
    if (attrs && typeof attrs._key === 'string' && attrs._key !== '') {
      return attrs._key
    }
    nextKey += 1
    return `pm-${nextKey.toString(36)}`
  }

  for (const node of doc.content) {
    dispatchPmNodeToBlocks(out, node, ensureKey)
  }
  return synchronizeFootnoteIndices(out)
}
