import type {
  LexicalBlockNode,
  LexicalBody,
  LexicalFootnoteDefinitionNode,
  LexicalNonContainerBlockNode,
  LexicalParagraphNode,
  LexicalTextNode,
} from '@kobato/shared/lexical/schema'

import { generateBlockKey } from '@kobato/shared/legacy-pt/utils'
import { synchronizeFootnoteIndicesLexical } from '@kobato/shared/lexical/footnote-sync-lexical'

// Lexical counterpart of `@kobato/shared/pt/footnote-merge` — the
// inline/footnote partition for `LexicalBody`. The editor renders prose
// only; footnote definitions live in parallel editor state (the
// `FootnoteEditorDialog` loop) and are merged back into the body at
// report time, exactly like the PT track's `mergeProseBodyWithFootnoteDefinitions`.

/** Split a body into prose blocks and footnote definition blocks (preserving order). */
export function partitionFootnoteDefinitionsLexical(body: LexicalBody): {
  prose: LexicalBlockNode[]
  definitions: LexicalFootnoteDefinitionNode[]
} {
  const prose: LexicalBlockNode[] = []
  const definitions: LexicalFootnoteDefinitionNode[] = []
  for (const block of body.root.children) {
    if (block.type === 'footnoteDefinition') {
      definitions.push(block)
    } else {
      prose.push(block)
    }
  }
  return { prose, definitions }
}

export function extractFootnoteDefinitionBlocksLexical(body: LexicalBody): LexicalFootnoteDefinitionNode[] {
  return partitionFootnoteDefinitionsLexical(body).definitions
}

/** Body for the editor surface — prose only; footnote definitions live in parallel state. */
export function stripFootnoteDefinitionsForEditorLexical(body: LexicalBody): LexicalBody {
  const { prose } = partitionFootnoteDefinitionsLexical(body)
  return { root: { ...body.root, children: prose } }
}

/**
 * Merge prose (editor output) with the parallel definition list and
 * renumber — the save-path equivalent of the PT
 * `mergeProseBodyWithFootnoteDefinitions`. `synchronizeFootnoteIndicesLexical`
 * renumbers refs + defs by citation order and moves defs to the end, so
 * the returned body is citation-ordered even if the caller appends the
 * defs out of order.
 */
export function mergeLexicalBodyWithFootnoteDefinitions(
  prose: LexicalBody,
  defs: readonly LexicalFootnoteDefinitionNode[],
): LexicalBody {
  return synchronizeFootnoteIndicesLexical({
    root: { ...prose.root, children: [...prose.root.children, ...defs] },
  })
}

/** Plain-text footnote body → lexical paragraph blocks (one paragraph per line). */
export function plainTextToLexicalFootnoteChildren(text: string): LexicalNonContainerBlockNode[] {
  const trimmedEnd = text.replace(/\s+$/, '')
  const rawLines = trimmedEnd === '' ? [''] : trimmedEnd.split('\n')
  return rawLines.map((line) => {
    const textNode: LexicalTextNode = {
      detail: 0,
      format: 0,
      mode: 'normal',
      style: '',
      text: line,
      type: 'text',
      version: 1,
    }
    const paragraph: LexicalParagraphNode = {
      direction: null,
      format: '',
      indent: 0,
      version: 1,
      type: 'paragraph',
      textFormat: 0,
      textStyle: '',
      children: [textNode],
    }
    return paragraph
  })
}

/** Lexical paragraph children → plain text (newline per paragraph) — dialog seed text. */
export function lexicalFootnoteChildrenToPlainText(children: readonly LexicalNonContainerBlockNode[]): string {
  const lines: string[] = []
  for (const block of children) {
    if (block.type !== 'paragraph' && block.type !== 'heading') {
      continue
    }
    const parts: string[] = []
    for (const child of block.children) {
      if (child.type === 'text') {
        parts.push(child.text)
      } else if (child.type === 'linebreak') {
        parts.push('\n')
      }
    }
    lines.push(parts.join(''))
  }
  return lines.join('\n')
}

/** Build a definition node (parallel state) from plain text; `ptKey` is the refs' target anchor. */
export function createFootnoteDefinitionNode(
  ptKey: string,
  index: number,
  plainText: string,
): LexicalFootnoteDefinitionNode {
  return {
    type: 'footnoteDefinition',
    ptKey,
    index,
    direction: null,
    format: '',
    indent: 0,
    version: 1,
    children: plainTextToLexicalFootnoteChildren(plainText),
  }
}

/** Fresh definition key — the same `generateBlockKey` the PT track uses for `_key`s. */
export function generateFootnoteKey(): string {
  return generateBlockKey()
}
