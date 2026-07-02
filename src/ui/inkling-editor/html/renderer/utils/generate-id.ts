import type { RendererOptions } from '@/ui/inkling-editor/html/renderer/types'

import { slugify } from '@/ui/inkling-editor/utils'

function generateId(text: string, options: RendererOptions) {
  if (!options.usedIdAttributes) {
    options.usedIdAttributes = {}
  }

  const id = slugify(text)
  let deduplicatedId = id

  if (options.usedIdAttributes[id] !== undefined) {
    deduplicatedId += `-${options.usedIdAttributes[id]}`

    options.usedIdAttributes[id] += 1
  } else {
    options.usedIdAttributes[id] = 1
  }

  return deduplicatedId
}

export default generateId
