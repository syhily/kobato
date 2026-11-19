import { MINIMAL_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers-core'
import { type Transformer } from '@lexical/markdown'
import { MarkdownShortcutPlugin as LexicalMarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'

export default function MarkdownShortcutPlugin({
  transformers = MINIMAL_TRANSFORMERS,
}: { transformers?: readonly Transformer[] } = {}) {
  // Lexical's plugin takes a mutable array; copy so readonly caller arrays are accepted
  return LexicalMarkdownShortcutPlugin({ transformers: [...transformers] })
}
