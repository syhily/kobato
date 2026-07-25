import type { Block, FootnoteDefinitionBlock, NonRecursiveBlock, PortableTextBody, TextBlock } from '@/shared/pt/schema'

import { synchronizeFootnoteIndices } from '@/shared/pt/footnote-sync'
import { generateBlockKey } from '@/shared/pt/utils'

/**
 * The one inline/footnote partition: `prose` renders in place, footnote
 * `definitions` render as a trailing section. Both render adapters (feed
 * HTML, React tree) consume this — the section markup itself stays
 * per-adapter, the partition does not.
 */
export function partitionFootnoteDefinitions(body: PortableTextBody): {
  prose: PortableTextBody
  definitions: FootnoteDefinitionBlock[]
} {
  const prose: Block[] = []
  const definitions: FootnoteDefinitionBlock[] = []
  for (const block of body) {
    if (block._type === 'footnoteDefinition') {
      definitions.push(block)
    } else {
      prose.push(block)
    }
  }
  return { prose, definitions }
}

export function extractFootnoteDefinitionBlocks(body: PortableTextBody): FootnoteDefinitionBlock[] {
  return partitionFootnoteDefinitions(body).definitions
}

/** Body passed into `bodyToPmDoc` for the page editor — prose only; footnotes live in parallel state. */
export function stripFootnoteDefinitionsForEditor(body: PortableTextBody): PortableTextBody {
  return partitionFootnoteDefinitions(body).prose
}

export function mergeProseBodyWithFootnoteDefinitions(
  prose: PortableTextBody,
  defs: readonly FootnoteDefinitionBlock[],
): PortableTextBody {
  return synchronizeFootnoteIndices([...prose, ...defs])
}

export function plainTextToFootnoteChildren(text: string): NonRecursiveBlock[] {
  const trimmedEnd = text.replace(/\s+$/, '')
  const rawLines = trimmedEnd === '' ? [''] : trimmedEnd.split('\n')
  return rawLines.map((line) => ({
    _type: 'block' as const,
    _key: generateBlockKey(),
    style: 'normal' as const,
    children: [{ _type: 'span' as const, _key: generateBlockKey(), text: line }],
  }))
}

export function footnoteChildrenToPlainText(children: readonly NonRecursiveBlock[]): string {
  const lines: string[] = []
  for (const block of children) {
    if (block._type !== 'block') {
      continue
    }
    const tb = block as TextBlock
    lines.push(tb.children.map((s) => s.text).join(''))
  }
  return lines.join('\n')
}
