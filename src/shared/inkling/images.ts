import type { InklingDocument } from '@/shared/inkling/schema'

import { walkInkling } from '@/shared/inkling/walk'

interface ImageCtx {
  paths: Set<string>
}

export function collectInklingImageStoragePaths(document: InklingDocument): string[] {
  const ctx: ImageCtx = { paths: new Set() }

  walkInkling(
    document,
    {
      image: (node, c) => {
        if (node.storagePath !== undefined && node.storagePath !== '') {
          c.paths.add(node.storagePath)
        }
      },
    },
    ctx,
  )

  return Array.from(ctx.paths)
}
