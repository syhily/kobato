#!/usr/bin/env node
//
// One-shot structural probe: detect "textual HTML tags" inside content.body
// span text. Mirrors probe-comment-literal-html.ts but scans article/page
// revisions instead of comments.
//
// Outputs ONLY aggregate counts and structural samples (tag name + which
// field + a redacted length). NEVER prints raw body content, URLs, or
// anything that could identify a post/page author.
//
//   pnpm exec vite-node scripts/inkling-poc/probe-article-literal-html.ts
//

import { writeFileSync } from 'node:fs'
import { Client } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
const REPORT_PATH = 'tmp/inkling-poc/article-literal-html-report.json'

interface Row {
  id: string
  type: string
  revisionNo: number
  status: string
  body: unknown
}

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?\/?>/g
const VOID_TAG_RE = /<(?:br|hr|img|input|meta|link|col|area|base|embed|source|track|wbr)\b[^>]*?\/?>/gi
const ENTITY_RE = /&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/g

interface TagStat {
  tag: string
  count: number
  inSpanText: number
  inCode: number
  inMath: number
  sampleLengths: number[]
}

function makeStat(tag: string): TagStat {
  return { tag, count: 0, inSpanText: 0, inCode: 0, inMath: 0, sampleLengths: [] }
}

function pct(n: number, d: number): string {
  if (d === 0) return 'n/a'
  return `${((n / d) * 100).toFixed(1)}%`
}

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()

  try {
    const res = await client.query<Row>('SELECT id::text, type, revision_no, status, body FROM content ORDER BY id')
    const total = res.rowCount ?? 0

    const byTag = new Map<string, TagStat>()
    let rowsWithTags = 0
    let rowsWithVoidTags = 0
    let rowsWithEntities = 0
    let totalTagOccurrences = 0
    let totalVoidOccurrences = 0
    let totalEntityOccurrences = 0
    let totalSpans = 0
    let spansWithTags = 0
    let looksLikeFullHtmlDoc = 0
    let looksLikeFragment = 0
    const densityBuckets = { '1': 0, '2-5': 0, '6-20': 0, '21-100': 0, '100+': 0 }

    // Concentration analysis.
    const byType = {
      post: { rows: 0, withTags: 0, tagOccurrences: 0 },
      page: { rows: 0, withTags: 0, tagOccurrences: 0 },
    }
    const byStatus = { draft: { rows: 0, withTags: 0 }, published: { rows: 0, withTags: 0 } }
    const byAge = { old: { rows: 0, withTags: 0 }, new: { rows: 0, withTags: 0 } }
    const OLD_REVISION_THRESHOLD = 5

    function bumpStat(tag: string, location: 'span' | 'code' | 'math', textLen: number) {
      let s = byTag.get(tag)
      if (!s) {
        s = makeStat(tag)
        byTag.set(tag, s)
      }
      s.count += 1
      if (location === 'span') s.inSpanText += 1
      else if (location === 'code') s.inCode += 1
      else s.inMath += 1
      if (s.sampleLengths.length < 3) s.sampleLengths.push(textLen)
    }

    for (const row of res.rows) {
      const body = row.body
      if (!Array.isArray(body)) continue

      const typeBucket = row.type === 'page' ? byType.page : byType.post
      typeBucket.rows += 1
      const statusBucket = row.status === 'published' ? byStatus.published : byStatus.draft
      statusBucket.rows += 1
      const ageBucket = row.revisionNo <= OLD_REVISION_THRESHOLD ? byAge.old : byAge.new
      ageBucket.rows += 1

      let rowTagCount = 0
      let rowVoidCount = 0
      let rowEntityCount = 0
      let rowSpans = 0
      let rowSpansWithTags = 0
      let rowHasFullDoc = false

      for (const block of body) {
        if (typeof block !== 'object' || block === null) continue
        const b = block as Record<string, unknown>
        const type = b._type

        if (type === 'block' && Array.isArray(b.children)) {
          for (const span of b.children as unknown[]) {
            if (typeof span !== 'object' || span === null) continue
            const sp = span as Record<string, unknown>
            if (typeof sp.text !== 'string') continue
            rowSpans += 1
            totalSpans += 1
            const text = sp.text

            TAG_RE.lastIndex = 0
            let m: RegExpExecArray | null
            let spanHadTag = false
            while ((m = TAG_RE.exec(text)) !== null) {
              const tag = m[1]!.toLowerCase()
              bumpStat(tag, 'span', text.length)
              rowTagCount += 1
              totalTagOccurrences += 1
              spanHadTag = true
            }
            if (spanHadTag) {
              rowSpansWithTags += 1
              spansWithTags += 1
            }

            VOID_TAG_RE.lastIndex = 0
            while (VOID_TAG_RE.exec(text) !== null) {
              rowVoidCount += 1
              totalVoidOccurrences += 1
            }

            ENTITY_RE.lastIndex = 0
            const entMatches = text.match(ENTITY_RE)
            if (entMatches) {
              rowEntityCount += entMatches.length
              totalEntityOccurrences += entMatches.length
            }

            if (/<\/?(?:html|body|head)\b/i.test(text)) {
              rowHasFullDoc = true
            }
          }
        } else if (type === 'code' && typeof b.code === 'string') {
          // code blocks legitimately contain <tags>
        } else if (type === 'mathBlock' && typeof b.tex === 'string') {
          // math TeX may contain \lt
        }
      }

      if (rowHasFullDoc) looksLikeFullHtmlDoc += 1
      if (rowTagCount > 0 || rowVoidCount > 0) {
        looksLikeFragment += 1
        rowsWithTags += 1
        typeBucket.withTags += 1
        statusBucket.withTags += 1
        ageBucket.withTags += 1
        typeBucket.tagOccurrences += rowTagCount + rowVoidCount
      }
      if (rowVoidCount > 0) rowsWithVoidTags += 1
      if (rowEntityCount > 0) rowsWithEntities += 1

      const density = rowTagCount + rowVoidCount
      if (density > 0) {
        if (density === 1) densityBuckets['1'] += 1
        else if (density <= 5) densityBuckets['2-5'] += 1
        else if (density <= 20) densityBuckets['6-20'] += 1
        else if (density <= 100) densityBuckets['21-100'] += 1
        else densityBuckets['100+'] += 1
      }
    }

    const sortedTags = [...byTag.entries()].sort((a, b) => b[1].count - a[1].count)

    const report = {
      totalRowsScanned: total,
      totalSpansScanned: totalSpans,
      rowsWithAnyLiteralTag: rowsWithTags,
      rowsWithVoidTags: rowsWithVoidTags,
      rowsWithHtmlEntities: rowsWithEntities,
      rowsLookingLikeFullHtmlDoc: looksLikeFullHtmlDoc,
      rowsWithFragmentTags: looksLikeFragment,
      totalTagOccurrences,
      totalVoidTagOccurrences: totalVoidOccurrences,
      totalEntityOccurrences,
      spansContainingTags: spansWithTags,
      densityBuckets,
      concentration: {
        byType,
        byStatus,
        byAge: {
          threshold: `revisionNo <= ${OLD_REVISION_THRESHOLD}`,
          ...byAge,
        },
      },
      tagBreakdown: sortedTags.map(([tag, s]) => ({
        tag,
        total: s.count,
        inSpanText: s.inSpanText,
        inCode: s.inCode,
        inMath: s.inMath,
        sampleSpanLengths: s.sampleLengths,
      })),
    }

    console.log('=== content.body textual-HTML probe (aggregate only) ===')
    console.log(`total content rows scanned:    ${total}`)
    console.log(`total spans scanned:           ${totalSpans}`)
    console.log('')
    console.log(`rows with any literal tag:     ${rowsWithTags} (${pct(rowsWithTags, total)})`)
    console.log(`rows with void tags (br/img):  ${rowsWithVoidTags} (${pct(rowsWithVoidTags, total)})`)
    console.log(`rows with HTML entities:       ${rowsWithEntities} (${pct(rowsWithEntities, total)})`)
    console.log(`rows looking like full doc:    ${looksLikeFullHtmlDoc}`)
    console.log(`rows with fragment tags:       ${looksLikeFragment}`)
    console.log('')
    console.log(`total tag occurrences:         ${totalTagOccurrences}`)
    console.log(`total void-tag occurrences:    ${totalVoidOccurrences}`)
    console.log(`total entity occurrences:      ${totalEntityOccurrences}`)
    console.log(`spans containing tags:         ${spansWithTags} (${pct(spansWithTags, totalSpans)})`)
    console.log('')
    console.log('=== tag density per affected row ===')
    for (const [k, v] of Object.entries(densityBuckets)) {
      console.log(`  ${k.padEnd(8)} tags: ${v} rows`)
    }
    console.log('')
    console.log('=== concentration ===')
    console.log(
      `  post: ${pct(byType.post.withTags, byType.post.rows)} affected (${byType.post.withTags}/${byType.post.rows})`,
    )
    console.log(
      `  page: ${pct(byType.page.withTags, byType.page.rows)} affected (${byType.page.withTags}/${byType.page.rows})`,
    )
    console.log(`  draft: ${pct(byStatus.draft.withTags, byStatus.draft.rows)} affected`)
    console.log(`  published: ${pct(byStatus.published.withTags, byStatus.published.rows)} affected`)
    console.log(`  old (rev<=5): ${pct(byAge.old.withTags, byAge.old.rows)} affected`)
    console.log(`  new (rev>5): ${pct(byAge.new.withTags, byAge.new.rows)} affected`)
    console.log('')
    console.log('=== tag breakdown (top 30) ===')
    console.log('  tag           total   spanText  code  math   sampleSpanLens')
    for (const [tag, s] of sortedTags.slice(0, 30)) {
      console.log(
        `  ${tag.padEnd(12)}  ${String(s.count).padStart(6)}   ${String(s.inSpanText).padStart(6)}   ${String(s.inCode).padStart(4)}  ${String(s.inMath).padStart(4)}   [${s.sampleLengths.join(',')}]}`,
      )
    }

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
    console.log('')
    console.log(`report written to ${REPORT_PATH}`)

    await client.end()
  } catch (err) {
    try {
      await client.end()
    } catch {
      /* ignore */
    }
    console.error('probe failed:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
