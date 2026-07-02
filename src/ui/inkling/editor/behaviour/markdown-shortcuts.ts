import type { Transformer } from '@lexical/markdown'
import type { LexicalEditor } from 'lexical'

import {
  BOLD_ITALIC_STAR,
  BOLD_STAR,
  HEADING,
  INLINE_CODE,
  ITALIC_STAR,
  LINK,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
  registerMarkdownShortcuts,
} from '@lexical/markdown'
import { useEffect } from 'react'

/**
 * Ghost-compatible markdown shortcuts for the Inkling editor.
 *
 * Ghost's editor (Koenig) auto-parses markdown as you type — typing `# `
 * at a line start converts it to an H1, `> ` to a blockquote, `* ` to a
 * bullet, `1. ` to a numbered item, and inline `**bold**` / `*italic*` /
 * `` `code` `` / `~~strike~~` / `[text](url)` are wrapped into formatted
 * text as soon as the closing marker is typed. This replicates that set.
 *
 * Implementation note: we use `@lexical/markdown`'s `registerMarkdownShortcuts`,
 * which registers node transforms that fire on text input. We deliberately
 * curate the transformer list rather than using the full `TRANSFORMERS`
 * default set, because:
 *
 *  - CODE (``` ``` blocks) needs `@lexical/code`'s `CodeNode`, which is not
 *    installed — Inkling uses its own `CodeCardNode` decorator. The slash
 *    menu + card chrome is the intended path for code blocks.
 *  - CHECK_LIST needs a `CheckListItemNode` we don't have.
 *  - UNDERSCORE variants (`__bold__`, `_italic_`) are omitted to match
 *    Ghost, which only documents the `*` forms. Underscore-italic is also
 *    ambiguous with CJK text where `_` is a legitimate word character.
 *
 * HR (`---`) is handled by Inkling's own `HorizontalRuleCardNode`, not the
 * `@lexical/code` `HorizontalRuleNode`, so it is left out here too.
 */
export const INKLING_MARKDOWN_TRANSFORMERS: Transformer[] = [
  // Block-level: fire when a markdown marker + space is typed at line start.
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  // Inline: fire when the closing marker is typed inside a paragraph.
  BOLD_ITALIC_STAR,
  BOLD_STAR,
  ITALIC_STAR,
  INLINE_CODE,
  STRIKETHROUGH,
  LINK,
]

export function registerInklingMarkdownShortcuts(
  editor: LexicalEditor,
  transformers: Transformer[] = INKLING_MARKDOWN_TRANSFORMERS,
): () => void {
  return registerMarkdownShortcuts(editor, transformers)
}

/**
 * React hook that registers markdown shortcuts for the lifetime of the
 * editor. Mount this inside a `<LexicalComposer>` to enable Ghost-style
 * markdown auto-formatting. Pass `transformers` to restrict the shortcut
 * set (e.g. the comment editor omits `HEADING` since it has no
 * `HeadingNode`).
 */
export function useInklingMarkdownShortcuts(editor: LexicalEditor | null, transformers?: Transformer[]): void {
  useEffect(() => {
    if (editor === null) {
      return undefined
    }
    return registerInklingMarkdownShortcuts(editor, transformers)
  }, [editor, transformers])
}
