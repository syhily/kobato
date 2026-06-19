#!/usr/bin/env node
//
// Second-pass shape probe: inspect how <a>/<img>/<br>/<p> are encoded inside
// span.text, with heavy redaction. We only print:
//   - the tag pattern (e.g. `<a href="...">`, `<img src="..." ...>`)
//   - whether it's a matching open/close pair or orphan
//   - redacted surrounding-text length
//   - attribute name presence (href / src / alt / target / rel), NEVER values
//
//   pnpm exec vite-node scripts/inkling-poc/probe-comment-literal-html-shapes.ts
//

import { Client } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL

interface Row {
  id: string
  body: unknown
}

// capture the opening tag fully to inspect its attribute *names*
const OPEN_TAG_RE = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g

function attrNames(attrString: string): string[] {
  const names: string[] = []
  const re = /([a-zA-Z-]+)(?:\s*=)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrString)) !== null) {
    names.push(m[1]!.toLowerCase())
  }
  return names
}

interface ShapeBucket {
  // e.g. "a[href]" or "img[src,alt]" or "br" or "p"
  pattern: string
  count: number
  // pairing: "pair" | "openOnly" | "closeOnly" | "selfClose"
  pair: Record<string, number>
  sampleSurroundingLen: number[]
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

    const buckets = new Map<string, ShapeBucket>()
    // for <a>, track whether href starts with http/mailto/#/relative (redacted category)
    const aHrefCategories: Record<string, number> = {}
    // for <img>, track src category
    const imgSrcCategories: Record<string, number> = {}

    function getBucket(pattern: string): ShapeBucket {
      let b = buckets.get(pattern)
      if (!b) {
        b = { pattern, count: 0, pair: {}, sampleSurroundingLen: [] }
        buckets.set(pattern, b)
      }
      return b
    }

    for (const row of res.rows) {
      const body = row.body
      if (!Array.isArray(body)) continue

      for (const block of body) {
        if (typeof block !== 'object' || block === null) continue
        const b = block as Record<string, unknown>
        if (b._type !== 'block' || !Array.isArray(b.children)) continue

        for (const span of b.children as unknown[]) {
          if (typeof span !== 'object' || span === null) continue
          const sp = span as Record<string, unknown>
          if (typeof sp.text !== 'string') continue
          const text = sp.text

          OPEN_TAG_RE.lastIndex = 0
          let m: RegExpExecArray | null
          while ((m = OPEN_TAG_RE.exec(text)) !== null) {
            const tag = m[1]!.toLowerCase()
            const attrs = m[2] ?? ''
            const attrNs = attrNames(attrs)
            const selfClosed = /\/\s*$/.test(m[0]!)

            const pattern = `${tag}[${attrNs.join(',') || '-'}]`
            const bucket = getBucket(pattern)
            bucket.count += 1
            if (bucket.sampleSurroundingLen.length < 3) {
              bucket.sampleSurroundingLen.push(text.length)
            }

            // pairing: for non-void tags, check if there's a matching close
            const isVoid = ['br', 'img', 'hr', 'input', 'meta', 'link', 'col'].includes(tag)
            if (selfClosed || isVoid) {
              bucket.pair.selfClose = (bucket.pair.selfClose ?? 0) + 1
            } else {
              const closeRe = new RegExp(`</${tag}\\s*>`, 'i')
              if (closeRe.test(text)) {
                bucket.pair.pair = (bucket.pair.pair ?? 0) + 1
              } else {
                bucket.pair.openOnly = (bucket.pair.openOnly ?? 0) + 1
              }
            }

            // href category for <a>
            if (tag === 'a') {
              const hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"/i) ?? attrs.match(/href\s*=\s*'([^']*)'/i)
              const href = hrefMatch?.[1] ?? ''
              let cat = 'empty'
              if (/^https?:\/\//i.test(href)) cat = 'http'
              else if (/^mailto:/i.test(href)) cat = 'mailto'
              else if (/^#/.test(href)) cat = 'anchor'
              else if (/^\/|^\.\.?\//.test(href)) cat = 'relative'
              else if (href.length > 0) cat = 'other'
              aHrefCategories[cat] = (aHrefCategories[cat] ?? 0) + 1
            }
            // src category for <img>
            if (tag === 'img') {
              const srcMatch = attrs.match(/src\s*=\s*"([^"]*)"/i) ?? attrs.match(/src\s*=\s*'([^']*)'/i)
              const src = srcMatch?.[1] ?? ''
              let cat = 'empty'
              if (/^https?:\/\//i.test(src)) cat = 'http'
              else if (/^\/|^\.\.?\//.test(src)) cat = 'relative'
              else if (/^data:/i.test(src)) cat = 'data'
              else if (src.length > 0) cat = 'other'
              imgSrcCategories[cat] = (imgSrcCategories[cat] ?? 0) + 1
            }
          }
        }
      }
    }

    const sorted = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count)

    console.log('=== literal-HTML shape probe (redacted) ===')
    console.log('')
    console.log('pattern              count   pairing              sampleSpanLen')
    for (const [, bucket] of sorted) {
      const pairing = Object.entries(bucket.pair)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
      console.log(
        `  ${bucket.pattern.padEnd(18)}  ${String(bucket.count).padStart(5)}   ${pairing.padEnd(20)}  [${bucket.sampleSurroundingLen.join(',')}]`,
      )
    }
    console.log('')
    console.log('=== <a> href categories (redacted) ===')
    for (const [cat, n] of Object.entries(aHrefCategories).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat.padEnd(10)} ${n}`)
    }
    console.log('')
    console.log('=== <img> src categories (redacted) ===')
    for (const [cat, n] of Object.entries(imgSrcCategories).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat.padEnd(10)} ${n}`)
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

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
