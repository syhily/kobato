import type { z } from 'zod'

// Structural redaction and shape statistics for PortableText bodies stored in
// `content.body` and `comment.body`. This module never emits raw text, URLs,
// user IDs, email addresses, IPs, or UAs — only structural metadata.

export interface BodyShapeStats {
  blockTypeCounts: Record<string, number>
  markTypeCounts: Record<string, number>
  blockStyleCounts: Record<string, number>
  listTypeCounts: Record<string, number>
  listLevelCounts: Record<string, number>
  alignCounts: Record<string, number>
  tableDimensionCounts: Record<string, number>
  nestedBlockCounts: Record<string, Record<string, number>>
  validationFailures: Array<{
    table: 'content' | 'comment'
    id: number | string
    paths: string[]
  }>
}

const SENSITIVE_STRING_KEYS = new Set<string>([
  'text',
  'href',
  'src',
  'audioUrl',
  'cover',
  'lyric',
  'caption',
  'alt',
  'code',
  'highlightedHtml',
  'tex',
  'mathml',
  'svg',
  'playerId',
  'thumbhash',
  'storagePath',
  'imageId',
])

const STANDARD_DECORATORS = new Set<string>(['strong', 'em', 'underline', 'code', 'strike-through'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function increment(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1
}

function emptyStats(): BodyShapeStats {
  return {
    blockTypeCounts: {},
    markTypeCounts: {},
    blockStyleCounts: {},
    listTypeCounts: {},
    listLevelCounts: {},
    alignCounts: {},
    tableDimensionCounts: {},
    nestedBlockCounts: {},
    validationFailures: [],
  }
}

/**
 * Return a deep-redacted copy of an arbitrary PortableText body value. Text
 * spans are replaced by `{ kind: 'text', length, blank }`; sensitive string
 * fields (URLs, src/href, captions, raw code/math, etc.) are replaced by
 * `{ kind: 'string', type, length }`. Structural keys such as `_type`,
 * `style`, `listItem`, `level`, and `align` are preserved.
 */
export function redactPortableTextBodyShape(value: unknown): unknown {
  return redactValue(null, value)
}

function redactValue(key: string | null, value: unknown): unknown {
  if (typeof value === 'string' && key !== null && SENSITIVE_STRING_KEYS.has(key)) {
    if (key === 'text') {
      return { kind: 'text', length: value.length, blank: value.trim().length === 0 }
    }
    return { kind: 'string', type: key, length: value.length }
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(null, entry))
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(k, v)
    }
    return out
  }

  return value
}

/**
 * Collect structural statistics from a single PortableText body. The collector
 * is defensive: it gathers whatever it can even when the value fails schema
 * validation. It never stores raw text or URLs.
 */
export function collectBodyShapeStats(value: unknown): BodyShapeStats {
  const stats = emptyStats()
  const blocks = Array.isArray(value) ? value : []
  for (const block of blocks) {
    collectBlockStats(block, stats.blockTypeCounts, stats)
  }
  return stats
}

function collectBlockStats(
  block: unknown,
  blockCounter: Record<string, number>,
  topLevelStats: BodyShapeStats | undefined,
): void {
  if (!isPlainObject(block)) {
    return
  }

  const type = block._type
  if (typeof type !== 'string') {
    return
  }

  increment(blockCounter, type)

  if (type === 'block') {
    collectTextBlockStats(block, topLevelStats)
    return
  }

  if (type === 'table') {
    collectTableStats(block, topLevelStats)
    return
  }

  if (type === 'solution' && topLevelStats !== undefined) {
    const nestedCounter = getNestedCounter(topLevelStats, 'solution')
    collectNestedBlocks(block.children, nestedCounter)
    return
  }

  if (type === 'twoColumn' && topLevelStats !== undefined) {
    const nestedCounter = getNestedCounter(topLevelStats, 'twoColumn')
    collectNestedBlocks(block.left, nestedCounter)
    collectNestedBlocks(block.right, nestedCounter)
    return
  }

  if (type === 'footnoteDefinition' && topLevelStats !== undefined) {
    const nestedCounter = getNestedCounter(topLevelStats, 'footnoteDefinition')
    collectNestedBlocks(block.children, nestedCounter)
  }
}

function collectTextBlockStats(block: Record<string, unknown>, topLevelStats: BodyShapeStats | undefined): void {
  if (topLevelStats === undefined) {
    return
  }

  if (typeof block.style === 'string') {
    increment(topLevelStats.blockStyleCounts, block.style)
  }

  if (typeof block.listItem === 'string') {
    increment(topLevelStats.listTypeCounts, block.listItem)
    if (typeof block.level === 'number') {
      increment(topLevelStats.listLevelCounts, String(block.level))
    }
  }

  if (typeof block.align === 'string') {
    increment(topLevelStats.alignCounts, block.align)
  }

  const markDefs = Array.isArray(block.markDefs) ? block.markDefs : []
  for (const markDef of markDefs) {
    if (isPlainObject(markDef) && typeof markDef._type === 'string') {
      increment(topLevelStats.markTypeCounts, markDef._type)
    }
  }

  const children = Array.isArray(block.children) ? block.children : []
  for (const span of children) {
    if (!isPlainObject(span) || span._type !== 'span') {
      continue
    }
    const marks = Array.isArray(span.marks) ? span.marks : []
    for (const mark of marks) {
      if (typeof mark === 'string' && STANDARD_DECORATORS.has(mark)) {
        increment(topLevelStats.markTypeCounts, mark)
      }
    }
  }
}

function collectTableStats(block: Record<string, unknown>, topLevelStats: BodyShapeStats | undefined): void {
  if (topLevelStats === undefined) {
    return
  }

  const rows = Array.isArray(block.rows) ? block.rows : []
  let maxCells = 0
  for (const row of rows) {
    if (isPlainObject(row) && Array.isArray(row.cells)) {
      maxCells = Math.max(maxCells, row.cells.length)
    }
  }
  increment(topLevelStats.tableDimensionCounts, `${rows.length}x${maxCells}`)
}

function getNestedCounter(stats: BodyShapeStats, containerType: string): Record<string, number> {
  if (stats.nestedBlockCounts[containerType] === undefined) {
    stats.nestedBlockCounts[containerType] = {}
  }
  return stats.nestedBlockCounts[containerType]
}

function collectNestedBlocks(children: unknown, counter: Record<string, number>): void {
  const blocks = Array.isArray(children) ? children : []
  for (const child of blocks) {
    collectBlockStats(child, counter, undefined)
  }
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value
  }
}

function mergeNestedCounts(
  target: Record<string, Record<string, number>>,
  source: Record<string, Record<string, number>>,
): void {
  for (const [containerType, counts] of Object.entries(source)) {
    if (target[containerType] === undefined) {
      target[containerType] = {}
    }
    mergeCounts(target[containerType], counts)
  }
}

/**
 * Merge multiple per-body statistics into a single aggregate. Validation
 * failures are concatenated in input order.
 */
export function mergeBodyShapeStats(stats: BodyShapeStats[]): BodyShapeStats {
  const merged = emptyStats()
  for (const entry of stats) {
    mergeCounts(merged.blockTypeCounts, entry.blockTypeCounts)
    mergeCounts(merged.markTypeCounts, entry.markTypeCounts)
    mergeCounts(merged.blockStyleCounts, entry.blockStyleCounts)
    mergeCounts(merged.listTypeCounts, entry.listTypeCounts)
    mergeCounts(merged.listLevelCounts, entry.listLevelCounts)
    mergeCounts(merged.alignCounts, entry.alignCounts)
    mergeCounts(merged.tableDimensionCounts, entry.tableDimensionCounts)
    mergeNestedCounts(merged.nestedBlockCounts, entry.nestedBlockCounts)
    merged.validationFailures.push(...entry.validationFailures)
  }
  return merged
}

/**
 * Extract Zod issue paths without exposing the original input value. Each path
 * is encoded as a dotted string suitable for the inventory report.
 */
export function collectValidationIssuePaths(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.path.map(String).join('.') || '(root)')
}
