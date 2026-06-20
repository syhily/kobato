import type { Client } from 'pg'

import type { InklingDocument } from '@/shared/inkling/schema'
import type { CommentBody } from '@/shared/pt/comment-schema'
import type { PortableTextBody } from '@/shared/pt/schema'

import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import { commentPortableTextToInklingDocument, portableTextToInklingDocument } from '@/shared/inkling/migrate-pt'
import { inklingToPlainText } from '@/shared/inkling/plaintext'
import { findResidualHtmlInText, walkInkling } from '@/shared/inkling/walk'
import { bodyToPlainText } from '@/shared/pt/utils'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

export interface VerificationRow {
  table: 'content' | 'comment'
  id: string
  ok: boolean
  error?: string
  ptPlainTextEmpty: boolean
  inklingPlainTextEmpty: boolean
  residualHtmlCount: number
  imageCount: number
  codeCount: number
  mathBlockCount: number
  inlineMathCount: number
  musicCount: number
  tableCount: number
  footnoteRefCount: number
  footnoteDefinitionCount: number
  listItemCount: number
  headingCount: number
}

export interface VerificationSummary {
  contentTotal: number
  contentConverted: number
  commentTotal: number
  commentConverted: number
  failedRows: VerificationRow[]
}

export interface VerificationReport {
  generatedAt: string
  rows: VerificationRow[]
  summary: VerificationSummary
}

interface PtMetrics {
  imageCount: number
  codeCount: number
  mathBlockCount: number
  inlineMathCount: number
  musicCount: number
  tableCount: number
  footnoteRefCount: number
  footnoteDefinitionCount: number
  listItemCount: number
  headingCount: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInklingDocument(value: unknown): value is InklingDocument {
  return isPlainObject(value) && value._type === 'inkling' && isPlainObject(value.root)
}

function normalizePlainText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function collectPtMetrics(body: PortableTextBody): PtMetrics {
  const metrics: PtMetrics = {
    imageCount: 0,
    codeCount: 0,
    mathBlockCount: 0,
    inlineMathCount: 0,
    musicCount: 0,
    tableCount: 0,
    footnoteRefCount: 0,
    footnoteDefinitionCount: 0,
    listItemCount: 0,
    headingCount: 0,
  }

  function countInlineMarks(spans: readonly unknown[], markDefs: readonly unknown[]): void {
    const mathKeys = new Set<string>()
    const refKeys = new Set<string>()
    for (const markDef of markDefs) {
      if (!isPlainObject(markDef) || typeof markDef._key !== 'string') {
        continue
      }
      if (markDef._type === 'mathInline') {
        mathKeys.add(markDef._key)
      }
      if (markDef._type === 'footnoteRef') {
        refKeys.add(markDef._key)
      }
    }
    for (const span of spans) {
      if (!isPlainObject(span) || span._type !== 'span') {
        continue
      }
      const marks = Array.isArray(span.marks) ? span.marks : []
      for (const mark of marks) {
        if (typeof mark === 'string' && mathKeys.has(mark)) {
          metrics.inlineMathCount += 1
        }
        if (typeof mark === 'string' && refKeys.has(mark)) {
          metrics.footnoteRefCount += 1
        }
      }
    }
  }

  function visitBlocks(blocks: readonly unknown[]): void {
    for (const block of blocks) {
      visitBlock(block)
    }
  }

  function visitBlock(block: unknown): void {
    if (!isPlainObject(block)) {
      return
    }
    const type = block._type
    if (typeof type !== 'string') {
      return
    }

    switch (type) {
      case 'block': {
        const style = block.style
        if (style === 'h1' || style === 'h2' || style === 'h3' || style === 'h4') {
          metrics.headingCount += 1
        }
        if (block.listItem !== undefined) {
          metrics.listItemCount += 1
        }
        const children = Array.isArray(block.children) ? block.children : []
        const markDefs = Array.isArray(block.markDefs) ? block.markDefs : []
        countInlineMarks(children, markDefs)
        break
      }
      case 'image':
        metrics.imageCount += 1
        break
      case 'code':
        metrics.codeCount += 1
        break
      case 'mathBlock':
        metrics.mathBlockCount += 1
        break
      case 'musicPlayer':
        metrics.musicCount += 1
        break
      case 'table': {
        metrics.tableCount += 1
        const rows = Array.isArray(block.rows) ? block.rows : []
        for (const row of rows) {
          if (!isPlainObject(row)) {
            continue
          }
          const cells = Array.isArray(row.cells) ? row.cells : []
          for (const cell of cells) {
            if (!isPlainObject(cell)) {
              continue
            }
            const content = Array.isArray(cell.content) ? cell.content : []
            const cellMarkDefs = Array.isArray(cell.markDefs) ? cell.markDefs : []
            countInlineMarks(content, cellMarkDefs)
          }
        }
        break
      }
      case 'footnoteDefinition':
        metrics.footnoteDefinitionCount += 1
        break
      case 'solution':
      case 'twoColumn': {
        const children = type === 'solution' ? block.children : undefined
        const left = type === 'twoColumn' ? block.left : undefined
        const right = type === 'twoColumn' ? block.right : undefined
        if (Array.isArray(children)) {
          visitBlocks(children)
        }
        if (Array.isArray(left)) {
          visitBlocks(left)
        }
        if (Array.isArray(right)) {
          visitBlocks(right)
        }
        break
      }
    }
  }

  visitBlocks(body)
  return metrics
}

interface InklingMetrics {
  imageCount: number
  codeCount: number
  mathBlockCount: number
  inlineMathCount: number
  musicCount: number
  tableCount: number
  footnoteRefCount: number
  footnoteDefinitionCount: number
  listItemCount: number
  headingCount: number
}

function collectInklingMetrics(document: InklingDocument): InklingMetrics {
  const metrics: InklingMetrics = {
    imageCount: 0,
    codeCount: 0,
    mathBlockCount: 0,
    inlineMathCount: 0,
    musicCount: 0,
    tableCount: 0,
    footnoteRefCount: 0,
    footnoteDefinitionCount: 0,
    listItemCount: 0,
    headingCount: 0,
  }

  walkInkling(
    document,
    {
      heading: (_node, _ctx, walkChildren) => {
        metrics.headingCount += 1
        walkChildren()
      },
      listitem: (_node, _ctx, walkChildren) => {
        metrics.listItemCount += 1
        walkChildren()
      },
      link: (_node, _ctx, walkChildren) => {
        walkChildren()
      },
      inlineMath: () => {
        metrics.inlineMathCount += 1
      },
      image: () => {
        metrics.imageCount += 1
      },
      code: () => {
        metrics.codeCount += 1
      },
      mathBlock: () => {
        metrics.mathBlockCount += 1
      },
      music: () => {
        metrics.musicCount += 1
      },
      table: (_node, _ctx, walkChildren) => {
        metrics.tableCount += 1
        walkChildren()
      },
      footnoteRef: () => {
        metrics.footnoteRefCount += 1
      },
      footnoteDefinition: (_node, _ctx, walkChildren) => {
        metrics.footnoteDefinitionCount += 1
        walkChildren()
      },
      solution: (_node, _ctx, walkChildren) => {
        walkChildren()
      },
      twoColumn: (_node, _ctx, walkChildren) => {
        walkChildren()
      },
    },
    undefined,
  )

  return metrics
}

function metricsMatch(pt: PtMetrics, inkling: InklingMetrics): boolean {
  return (
    pt.imageCount === inkling.imageCount &&
    pt.codeCount === inkling.codeCount &&
    pt.mathBlockCount === inkling.mathBlockCount &&
    pt.inlineMathCount === inkling.inlineMathCount &&
    pt.musicCount === inkling.musicCount &&
    pt.tableCount === inkling.tableCount &&
    pt.footnoteRefCount === inkling.footnoteRefCount &&
    pt.footnoteDefinitionCount === inkling.footnoteDefinitionCount &&
    pt.listItemCount === inkling.listItemCount &&
    pt.headingCount === inkling.headingCount
  )
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function emptyPtMetrics(): PtMetrics {
  return {
    imageCount: 0,
    codeCount: 0,
    mathBlockCount: 0,
    inlineMathCount: 0,
    musicCount: 0,
    tableCount: 0,
    footnoteRefCount: 0,
    footnoteDefinitionCount: 0,
    listItemCount: 0,
    headingCount: 0,
  }
}

function verifyRow(table: 'content' | 'comment', id: string, body: unknown): VerificationRow {
  const alreadyInkling = isInklingDocument(body)
  // body is unknown coming from the DB JSONB column; Array.isArray
  // narrows it to unknown[] but TypeScript cannot infer PortableTextBody.
  const ptBody = Array.isArray(body) ? unsafeCast<PortableTextBody>(body) : []
  const ptMetrics = alreadyInkling ? emptyPtMetrics() : collectPtMetrics(ptBody)
  const ptPlainText = alreadyInkling ? '' : bodyToPlainText(ptBody)

  try {
    let document: InklingDocument
    if (alreadyInkling) {
      document = body
    } else if (table === 'content') {
      document = portableTextToInklingDocument(ptBody)
    } else {
      // ptBody has been verified as an array above; CommentBody is a
      // subtype of PortableTextBody used by the comment migration path.
      document = commentPortableTextToInklingDocument(unsafeCast<CommentBody>(ptBody))
    }

    const mode = table === 'content' ? 'article' : 'comment'
    const modeValidation = validateInklingDocumentForMode(document, mode)
    if (!modeValidation.ok) {
      return {
        table,
        id,
        ok: false,
        error: `Feature validation failed for ${mode}: ${modeValidation.forbiddenType} at ${modeValidation.path}`,
        ptPlainTextEmpty: ptPlainText.length === 0,
        inklingPlainTextEmpty: true,
        residualHtmlCount: table === 'comment' ? findResidualHtmlInText(document).length : 0,
        ...ptMetrics,
      }
    }

    const inklingMetrics = collectInklingMetrics(document)
    const inklingPlainText = inklingToPlainText(document)
    const residualHtml = table === 'comment' ? findResidualHtmlInText(document) : []

    let error: string | undefined
    if (!alreadyInkling) {
      const plainTextEmptyMatch = (ptPlainText.length === 0) === (inklingPlainText.length === 0)
      const normalizedPt = normalizePlainText(ptPlainText)
      const normalizedInkling = normalizePlainText(inklingPlainText)
      const plainTextOk = plainTextEmptyMatch && (normalizedPt === normalizedInkling || normalizedPt.length === 0)
      const metricsOk = metricsMatch(ptMetrics, inklingMetrics) && plainTextOk
      if (!metricsOk) {
        error = `Metric mismatch: PT ${JSON.stringify(ptMetrics)} vs Inkling ${JSON.stringify(inklingMetrics)}`
      }
    }
    if (residualHtml.length > 0) {
      error = error === undefined ? 'Residual HTML in comment text' : `${error}; residual HTML in comment text`
    }

    return {
      table,
      id,
      ok: error === undefined,
      error,
      ptPlainTextEmpty: ptPlainText.length === 0,
      inklingPlainTextEmpty: inklingPlainText.length === 0,
      residualHtmlCount: residualHtml.length,
      ...inklingMetrics,
    }
  } catch (error) {
    return {
      table,
      id,
      ok: false,
      error: formatError(error),
      ptPlainTextEmpty: ptPlainText.length === 0,
      inklingPlainTextEmpty: true,
      residualHtmlCount: 0,
      ...ptMetrics,
    }
  }
}

export async function verifyPtToInklingMigration(client: Client): Promise<VerificationReport> {
  await client.query('BEGIN')
  await client.query('SET TRANSACTION READ ONLY')

  const contentResult = await client.query<{ id: bigint; body: unknown }>('SELECT id, body FROM content ORDER BY id')
  const commentResult = await client.query<{ id: bigint; body: unknown }>('SELECT id, body FROM comment ORDER BY id')

  await client.query('COMMIT')

  const rows: VerificationRow[] = []

  for (const row of contentResult.rows) {
    rows.push(verifyRow('content', row.id.toString(), row.body))
  }
  for (const row of commentResult.rows) {
    rows.push(verifyRow('comment', row.id.toString(), row.body))
  }

  const failedRows = rows.filter((row) => !row.ok)

  const summary: VerificationSummary = {
    contentTotal: contentResult.rows.length,
    contentConverted: contentResult.rows.length - rows.filter((row) => row.table === 'content' && !row.ok).length,
    commentTotal: commentResult.rows.length,
    commentConverted: commentResult.rows.length - rows.filter((row) => row.table === 'comment' && !row.ok).length,
    failedRows,
  }

  return {
    generatedAt: new Date().toISOString(),
    rows,
    summary,
  }
}
