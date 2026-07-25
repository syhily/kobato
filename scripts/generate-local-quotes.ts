#!/usr/bin/env node
//
// One-time codegen for the calendar's built-in daily-quote bank.
//
// Fetches the `famous` quote list from BullshitGenerator's data.json
// (pinned commit — the input is stable, so re-running is reproducible),
// decodes every entry, and writes the COMPLETE list to
// `src/server/render/calendar/local-quotes.ts`.
//
//   pnpx vite-node scripts/generate-local-quotes.ts
//
// Processing rules (keep in sync with the header comment of the generated
// file):
//   - Entries use the generator template `作者a，内容。b` (full-width `a，`
//     or half-width `a, `; the trailing `b` is optional). Entries that do
//     not split cleanly are template residue, not quotes — dropped.
//   - Stray spaces before CJK punctuation are removed.
//   - Deduped by content; source order preserved. NO editorial filtering
//     (no length caps, no blocklists): the bank is the complete famous
//     list, quirks included — the calendar renderer clamps long quotes
//     to three lines with an ellipsis, and `pickForDate` hashes the date
//     so the whole bank stays reachable across years.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_FILE = join(__dirname, '..', 'src', 'server', 'render', 'calendar', 'local-quotes.ts')

const SOURCE_URL =
  'https://raw.githubusercontent.com/liutongyang/BullshitGenerator/690988559f39f2e452b1bfd5904282d90c7ace32/data.json'

interface Quote {
  content: string
  author: string
}

function parseEntry(raw: string): Quote | null {
  // `作者a，内容。b` — author precedes the `a，` / `a, ` placeholder; the
  // trailing `b` placeholder is optional.
  const match = /^(.{2,16}?)a[，,]\s*(.+?)\s*b?$/.exec(raw.trim())
  if (match === null) {
    return null
  }
  const author = match[1].trim()
  // Stray spaces before CJK punctuation sneak in from the source data.
  const content = match[2].trim().replace(/\s+([。，！？；：、])/g, '$1')
  return { content, author }
}

async function main() {
  const res = await fetch(SOURCE_URL)
  if (!res.ok) {
    throw new Error(`下载 data.json 失败: ${res.status}`)
  }
  const data: unknown = await res.json()
  if (typeof data !== 'object' || data === null || !('famous' in data) || !Array.isArray(data.famous)) {
    throw new Error('data.json 中没有 famous 数组')
  }
  const famous: unknown[] = data.famous

  const seen = new Set<string>()
  const quotes: Quote[] = []
  let dropped = 0
  for (const raw of famous) {
    if (typeof raw !== 'string') {
      dropped++
      continue
    }
    const parsed = parseEntry(raw)
    if (parsed === null || seen.has(parsed.content)) {
      dropped++
      continue
    }
    seen.add(parsed.content)
    quotes.push(parsed)
  }

  const lines = quotes.map((q) => `  { content: ${JSON.stringify(q.content)}, author: ${JSON.stringify(q.author)} },`)
  const output = `// GENERATED FILE — do not edit by hand.
//
// Built-in daily-quote bank for the calendar image, the final fallback
// when the configured remote provider fails (or when \`local\` is the
// configured source). This is the COMPLETE famous list from the source —
// no editorial filtering; the renderer clamps long quotes to three lines
// with an ellipsis, and \`pickForDate\` hashes the date so every entry
// stays reachable across years.
//
// Source: BullshitGenerator data.json @ 690988559f39f2e452b1bfd5904282d90c7ace32
//   ${SOURCE_URL}
// Regenerate: pnpx vite-node scripts/generate-local-quotes.ts
// Processing: split the \`作者a，内容。b\` template (unparseable entries are
// template residue, dropped), tidy CJK punctuation spacing, dedupe by
// content, keep source order.

import type { DailyQuote } from '@/server/render/calendar/daily-quote'

export const LOCAL_QUOTES: readonly DailyQuote[] = [
${lines.join('\n')}
]
`
  writeFileSync(OUT_FILE, output, 'utf-8')
  console.log(
    `共 ${famous.length} 条原始条目，解析保留 ${quotes.length} 条（丢弃 ${dropped} 条模板残留/重复）→ ${OUT_FILE}`,
  )
}

await main()
