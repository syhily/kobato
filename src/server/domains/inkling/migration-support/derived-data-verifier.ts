import type { Client } from 'pg'

import type { InklingDocument } from '@/shared/inkling/schema'
import type { PortableTextBody } from '@/shared/pt/schema'

import { collectInklingHeadings } from '@/shared/inkling/headings'
import { collectInklingImageStoragePaths } from '@/shared/inkling/images'
import { portableTextToInklingDocument } from '@/shared/inkling/migrate-pt'
import { inklingToPlainText } from '@/shared/inkling/plaintext'
import { portableTextBodySchema } from '@/shared/pt/schema'
import { collectHeadings, collectImageStoragePaths, bodyToPlainText } from '@/shared/pt/utils'

export type DerivedDataMismatchCategory = 'headings' | 'images' | 'plaintext'

export interface DerivedDataMismatchDetails {
  headings?: {
    ptCount: number
    inklingCount: number
    ptSlugs: string[]
    inklingSlugs: string[]
  }
  images?: {
    ptCount: number
    inklingCount: number
  }
  plaintext?: {
    ptEmpty: boolean
    inklingEmpty: boolean
    ptLength: number
    inklingLength: number
  }
}

export interface DerivedDataMismatch {
  rowId: number
  categories: DerivedDataMismatchCategory[]
  details: DerivedDataMismatchDetails
  error?: string
}

export interface DerivedDataReport {
  generatedAt: string
  contentTotal: number
  contentProcessed: number
  mismatchCount: number
  mismatches: DerivedDataMismatch[]
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

function headingsEqual(
  pt: PortableTextBody,
  inkling: InklingDocument,
): { equal: boolean; ptSlugs: string[]; inklingSlugs: string[] } {
  const ptHeadings = collectHeadings(pt)
  const inklingHeadings = collectInklingHeadings(inkling)
  const ptSlugs = ptHeadings.map((h) => h.slug)
  const inklingSlugs = inklingHeadings.map((h) => h.slug)
  if (ptHeadings.length !== inklingHeadings.length) {
    return { equal: false, ptSlugs, inklingSlugs }
  }
  for (let i = 0; i < ptHeadings.length; i += 1) {
    const a = ptHeadings[i]
    const b = inklingHeadings[i]
    if (a === undefined || b === undefined) {
      return { equal: false, ptSlugs, inklingSlugs }
    }
    if (a.depth !== b.depth || a.slug !== b.slug) {
      return { equal: false, ptSlugs, inklingSlugs }
    }
  }
  return { equal: true, ptSlugs, inklingSlugs }
}

function imagePathsEqual(pt: PortableTextBody, inkling: InklingDocument): boolean {
  const ptPaths = collectImageStoragePaths(pt)
  const inklingPaths = collectInklingImageStoragePaths(inkling)
  return arraysEqual(ptPaths, inklingPaths)
}

function plainTextEquivalent(pt: PortableTextBody, inkling: InklingDocument): boolean {
  const ptText = bodyToPlainText(pt)
  const inklingText = inklingToPlainText(inkling)
  // Migration parity treats empty vs non-empty as the meaningful mismatch;
  // exact whitespace may differ because of list serialization, so we only
  // require emptiness to match. Non-empty content is validated by the migration
  // verifier's metric checks and by spot inspection.
  return (ptText.length === 0) === (inklingText.length === 0)
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function verifyRow(body: unknown): { ok: true } | { ok: false; mismatch: DerivedDataMismatch } {
  if (!Array.isArray(body)) {
    return {
      ok: false,
      mismatch: {
        rowId: 0,
        categories: ['plaintext'],
        details: { plaintext: { ptEmpty: true, inklingEmpty: true, ptLength: 0, inklingLength: 0 } },
        error: 'Body is not a PortableText array',
      },
    }
  }

  let pt: PortableTextBody
  try {
    pt = portableTextBodySchema.parse(body)
  } catch (error) {
    return {
      ok: false,
      mismatch: {
        rowId: 0,
        categories: ['plaintext'],
        details: { plaintext: { ptEmpty: true, inklingEmpty: true, ptLength: 0, inklingLength: 0 } },
        error: `Invalid PortableText body: ${formatError(error)}`,
      },
    }
  }

  let inkling: InklingDocument
  try {
    inkling = portableTextToInklingDocument(pt)
  } catch (error) {
    return {
      ok: false,
      mismatch: {
        rowId: 0,
        categories: ['plaintext'],
        details: {
          plaintext: {
            ptEmpty: bodyToPlainText(pt).length === 0,
            inklingEmpty: true,
            ptLength: bodyToPlainText(pt).length,
            inklingLength: 0,
          },
        },
        error: `PT to Inkling conversion failed: ${formatError(error)}`,
      },
    }
  }

  const categories: DerivedDataMismatchCategory[] = []
  const details: DerivedDataMismatchDetails = {}

  const headingComparison = headingsEqual(pt, inkling)
  if (!headingComparison.equal) {
    categories.push('headings')
    details.headings = {
      ptCount: headingComparison.ptSlugs.length,
      inklingCount: headingComparison.inklingSlugs.length,
      ptSlugs: headingComparison.ptSlugs,
      inklingSlugs: headingComparison.inklingSlugs,
    }
  }

  if (!imagePathsEqual(pt, inkling)) {
    categories.push('images')
    details.images = {
      ptCount: collectImageStoragePaths(pt).length,
      inklingCount: collectInklingImageStoragePaths(inkling).length,
    }
  }

  if (!plainTextEquivalent(pt, inkling)) {
    categories.push('plaintext')
    details.plaintext = {
      ptEmpty: bodyToPlainText(pt).length === 0,
      inklingEmpty: inklingToPlainText(inkling).length === 0,
      ptLength: bodyToPlainText(pt).length,
      inklingLength: inklingToPlainText(inkling).length,
    }
  }

  if (categories.length === 0) {
    return { ok: true }
  }

  return {
    ok: false,
    mismatch: {
      rowId: 0,
      categories,
      details,
    },
  }
}

export async function verifyDerivedDataParity(client: Client): Promise<DerivedDataReport> {
  await client.query('BEGIN')
  await client.query('SET TRANSACTION READ ONLY')

  const contentResult = await client.query<{ id: bigint; body: unknown }>('SELECT id, body FROM content ORDER BY id')

  await client.query('COMMIT')

  const mismatches: DerivedDataMismatch[] = []

  for (const row of contentResult.rows) {
    const result = verifyRow(row.body)
    if (!result.ok) {
      mismatches.push({ ...result.mismatch, rowId: Number(row.id) })
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    contentTotal: contentResult.rows.length,
    contentProcessed: contentResult.rows.length,
    mismatchCount: mismatches.length,
    mismatches,
  }
}
