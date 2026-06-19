#!/usr/bin/env node
//
// One-shot structural probe: detect "textual HTML tags" inside comment.body
// span text. These are legacy artifacts from the historical HTML→PT import
// where raw HTML leaked into span.text instead of being parsed into proper
// PT structure.
//
// Outputs ONLY aggregate counts and structural samples (tag name + which
// field + a redacted length). NEVER prints raw user content, URLs, or
// anything that could identify a comment author.
//
//   pnpm exec vite-node scripts/inkling-poc/probe-comment-literal-html.ts
//

import { Client } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL

interface Row {
  id: string
  body: unknown
}

// Match likely HTML tags embedded as text. We deliberately keep this broad
// on the first pass to see what's out there, then narrow.
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?\/?>/g
// Self-closing or void-like
const VOID_TAG_RE = /<(?:br|hr|img|input|meta|link|col|area|base|embed|source|track|wbr)\b[^>]*?\/?>/gi
// HTML entities that suggest raw HTML source
const ENTITY_RE = /&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/g

interface TagStat {
  tag: string
  count: number
  // where it appeared: span-text / code-code / math-tex
  inSpanText: number
  inCode: number
  inMath: number
  // sample lengths (redacted): lengths of the surrounding span text
  sampleLengths: number[]
}

function makeStat(tag: string): TagStat {
  return { tag, count: 0, inSpanText: 0, inCode: 0, inMath: 0, sampleLengths: [] }
}

function countTags(text: string, stat: TagStat, location: 'span' | 'code' | 'math') {
  TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TAG_RE.exec(text)) !== null) {
    const tag = m[1]!.toLowerCase()
    let s = stat
    // bucket by tag — but we aggregate into the passed stat keyed by tag group
    s.count += 1
    if (location === 'span') s.inSpanText += 1
    else if (location === 'code') s.inCode += 1
    else s.inMath += 1
    if (s.sampleLengths.length < 3)
      s.sampleLengths.push(text.length)
      // push tag into a side-channel via closure-free trick: re-key later
    ;(s as TagStat & { _tag?: string })._tag = tag
  }
}

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()

  try {
    const res = await client.query<Row>('SELECT id::text, body FROM comment ORDER BY id')
    const total = res.rowCount ?? 0

    const byTag = new Map<string, TagStat>()
    let commentsWithTags = 0
    let commentsWithVoidTags = 0
    let commentsWithEntities = 0
    let totalTagOccurrences = 0
    let totalVoidOccurrences = 0
    let totalEntityOccurrences = 0
    let totalSpans = 0
    let spansWithTags = 0
    // patterns that look like broken structures
    let looksLikeFullHtmlDoc = 0
    let looksLikeFragment = 0
    // distribution of tag density per affected comment
    const densityBuckets = { '1': 0, '2-5': 0, '6-20': 0, '21-100': 0, '100+': 0 }

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

      let commentTagCount = 0
      let commentVoidCount = 0
      let commentEntityCount = 0
      let commentSpans = 0
      let commentSpansWithTags = 0
      let commentHasFullDoc = false

      for (const block of body) {
        if (typeof block !== 'object' || block === null) continue
        const b = block as Record<string, unknown>
        const type = b._type

        if (type === 'block' && Array.isArray(b.children)) {
          for (const span of b.children as unknown[]) {
            if (typeof span !== 'object' || span === null) continue
            const sp = span as Record<string, unknown>
            if (typeof sp.text !== 'string') continue
            commentSpans += 1
            totalSpans += 1
            const text = sp.text

            // tags
            TAG_RE.lastIndex = 0
            let m: RegExpExecArray | null
            let spanHadTag = false
            while ((m = TAG_RE.exec(text)) !== null) {
              const tag = m[1]!.toLowerCase()
              bumpStat(tag, 'span', text.length)
              commentTagCount += 1
              totalTagOccurrences += 1
              spanHadTag = true
            }
            if (spanHadTag) {
              commentSpansWithTags += 1
              spansWithTags += 1
            }

            // void tags
            VOID_TAG_RE.lastIndex = 0
            while (VOID_TAG_RE.exec(text) !== null) {
              commentVoidCount += 1
              totalVoidOccurrences += 1
            }

            // entities
            ENTITY_RE.lastIndex = 0
            const entMatches = text.match(ENTITY_RE)
            if (entMatches) {
              commentEntityCount += entMatches.length
              totalEntityOccurrences += entMatches.length
            }

            // full-doc detection: <html, <body, <head
            if (/<\/?(?:html|body|head)\b/i.test(text)) {
              commentHasFullDoc = true
            }
          }
        } else if (type === 'code' && typeof b.code === 'string') {
          // code blocks legitimately contain <tags> — skip, they're intentional
        } else if (type === 'mathBlock' && typeof b.tex === 'string') {
          // math TeX may contain \lt — skip
        }
      }

      if (commentHasFullDoc) looksLikeFullHtmlDoc += 1
      if (commentTagCount > 0 || commentVoidCount > 0) {
        looksLikeFragment += 1
        commentsWithTags += 1
      }
      if (commentVoidCount > 0) commentsWithVoidTags += 1
      if (commentEntityCount > 0) commentsWithEntities += 1

      const density = commentTagCount + commentVoidCount
      if (density === 1) densityBuckets['1'] += 1
      else if (density <= 5) densityBuckets['2-5'] += 1
      else if (density <= 20) densityBuckets['6-20'] += 1
      else if (density <= 100) densityBuckets['21-100'] += 1
      else if (density > 100) densityBuckets['100+'] += 1
    }

    const sortedTags = [...byTag.entries()].sort((a, b) => b[1].count - a[1].count)

    console.log('=== comment.body textual-HTML probe (aggregate only) ===')
    console.log(`total comments scanned:        ${total}`)
    console.log(`total spans scanned:           ${totalSpans}`)
    console.log('')
    console.log(`comments with any literal tag: ${commentsWithTags} (${pct(commentsWithTags, total)})`)
    console.log(`comments with void tags (br/img/...): ${commentsWithVoidTags} (${pct(commentsWithVoidTags, total)})`)
    console.log(`comments with HTML entities:   ${commentsWithEntities} (${pct(commentsWithEntities, total)})`)
    console.log(`comments looking like full <html>/<body> doc: ${looksLikeFullHtmlDoc}`)
    console.log(`comments with fragment tags:   ${looksLikeFragment}`)
    console.log('')
    console.log(`total tag occurrences:         ${totalTagOccurrences}`)
    console.log(`total void-tag occurrences:    ${totalVoidOccurrences}`)
    console.log(`total entity occurrences:      ${totalEntityOccurrences}`)
    console.log(`spans containing tags:         ${spansWithTags} (${pct(spansWithTags, totalSpans)})`)
    console.log('')
    console.log('=== tag density per affected comment ===')
    for (const [k, v] of Object.entries(densityBuckets)) {
      console.log(`  ${k.padEnd(8)} tags: ${v} comments`)
    }
    console.log('')
    console.log('=== tag breakdown (top 30) ===')
    console.log('  tag           total   spanText  code  math   sampleSpanLens')
    for (const [tag, s] of sortedTags.slice(0, 30)) {
      console.log(
        `  ${tag.padEnd(12)}  ${String(s.count).padStart(6)}   ${String(s.inSpanText).padStart(6)}   ${String(s.inCode).padStart(4)}  ${String(s.inMath).padStart(4)}   [${s.sampleLengths.join(',')}]`,
      )
    }

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

function pct(n: number, d: number): string {
  if (d === 0) return 'n/a'
  return `${((n / d) * 100).toFixed(1)}%`
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
