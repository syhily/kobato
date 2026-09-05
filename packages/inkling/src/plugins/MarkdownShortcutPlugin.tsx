import { type Transformer } from '@lexical/markdown'
import { MarkdownShortcutPlugin as LexicalMarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'

import { MINIMAL_TRANSFORMERS } from '@/markdown/transformers-core'

// The default is MINIMAL_TRANSFORMERS (plan C5, deliberate 2.x default
// change): the only set safe for any node composition — text-format
// transformers act on TextNode alone and the text-match set needs LinkNode.
// The full element shortcuts (heading/list/quote/fence/hr) require the
// matching registered nodes, so `InklingEditor` passes DEFAULT_TRANSFORMERS
// explicitly; bare InklingSurface/InklingComposableEditor consumers now get
// the minimal set unless they opt into more.
export default function MarkdownShortcutPlugin({
  transformers = MINIMAL_TRANSFORMERS,
}: { transformers?: readonly Transformer[] } = {}) {
  // Lexical's plugin takes a mutable array; copy so readonly caller arrays are accepted
  return LexicalMarkdownShortcutPlugin({ transformers: [...transformers] })
}
