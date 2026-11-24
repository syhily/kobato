import type { SQLOutputValue } from 'node:sqlite'

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

interface PageRow {
  slug: string
  publishedAt: number
  html: string
}

interface Element {
  name: string
  items: number
}

const SKIP = new Set([
  'pre',
  'code',
  'kbd',
  'samp',
  'tt',
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
])
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])
const NAMED_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['nbsp', '\u00a0'],
])
const REPLACEMENT = 0xfffd

function codePoint(value: number): number {
  if (value <= 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return REPLACEMENT
  }
  return value
}

function decode(text: string): string {
  return text.replace(/&(x[0-9a-f]+|[0-9]+|[a-z][a-z0-9]*);/gi, (entity: string, body: string) => {
    if (body[0].toLowerCase() === 'x') {
      return String.fromCodePoint(codePoint(Number.parseInt(body.slice(1), 16)))
    }
    if (body[0] >= '0' && body[0] <= '9') {
      return String.fromCodePoint(codePoint(Number.parseInt(body, 10)))
    }
    const named = NAMED_ENTITIES.get(body)
    if (named === undefined) {
      throw new Error(`unsupported HTML entity: ${entity}`)
    }
    return named
  })
}

function pageCodepoints(html: string): number[] {
  const found = new Set<number>()
  const stack: Element[] = []
  let skipFrom = Number.POSITIVE_INFINITY
  const add = (text: string): void => {
    for (const char of decode(text)) {
      found.add(char.codePointAt(0) ?? REPLACEMENT)
    }
  }
  const open = (name: string, selfClosing: boolean): void => {
    const parent = stack.at(-1)
    if (stack.length < skipFrom && name === 'li' && parent?.name === 'ol') {
      parent.items += 1
      add(`${parent.items}.`)
    }
    if (VOID.has(name) || selfClosing) {
      return
    }
    stack.push({ name, items: 0 })
    if (SKIP.has(name)) {
      skipFrom = Math.min(skipFrom, stack.length)
    }
  }
  const close = (name: string): void => {
    const top = stack.pop()
    if (top?.name !== name) {
      throw new Error(`mismatched end tag </${name}> (open: ${top?.name ?? 'none'})`)
    }
    if (stack.length < skipFrom) {
      skipFrom = Number.POSITIVE_INFINITY
    }
  }
  const addText = (text: string): void => {
    if (text !== '' && stack.length < skipFrom) {
      add(text)
    }
  }

  let at = 0
  while (at < html.length) {
    const start = html.indexOf('<', at)
    if (start < 0) {
      addText(html.slice(at))
      break
    }
    addText(html.slice(at, start))
    const next = html[start + 1]
    if (next === undefined || !/[a-z!/]/i.test(next)) {
      addText('<')
      at = start + 1
      continue
    }
    if (next === '!' || next === '?') {
      const end = html.indexOf('>', start)
      at = end < 0 ? html.length : end + 1
      continue
    }
    if (next === '/') {
      const end = html.indexOf('>', start)
      close(
        html
          .slice(start + 2, end)
          .trim()
          .toLowerCase(),
      )
      at = end + 1
      continue
    }
    let scan = start + 1
    let quote: string | null = null
    for (; scan < html.length; scan++) {
      const char = html[scan]
      if (quote !== null) {
        if (char === quote) {
          quote = null
        }
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (char === '>') {
        break
      }
    }
    const tag = html.slice(start + 1, scan)
    at = scan + 1
    const name = /^([a-z][a-z0-9-]*)/i.exec(tag)?.[1]
    if (name !== undefined) {
      open(name.toLowerCase(), /\/\s*$/.test(tag))
    }
  }
  return [...found].sort((a, b) => a - b)
}

function toPageRow(row: Record<string, SQLOutputValue>): PageRow {
  const { slug, html } = row
  const publishedAt = row.published_at
  if (
    typeof slug !== 'string' ||
    typeof html !== 'string' ||
    (typeof publishedAt !== 'number' && typeof publishedAt !== 'bigint')
  ) {
    throw new TypeError('unexpected content row shape')
  }
  return { slug, publishedAt: Number(publishedAt), html }
}

function snapshotDate(): string {
  const now = new Date()
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join(
    '-',
  )
}

const [databasePath, outputPath] = process.argv.slice(2)
if (databasePath === undefined || outputPath === undefined) {
  process.stderr.write('usage: node scripts/blog-pages.ts <kobato.db> <output fixture>\n')
  process.exit(1)
}

const db = new DatabaseSync(databasePath, { readOnly: true })
const rows = db
  .prepare(
    `SELECT p.slug, p.published_at, c.body_html AS html
       FROM post p JOIN content c ON c.id = p.published_revision_id
      WHERE p.deleted_at IS NULL AND p.published = 1
      UNION ALL
     SELECT p.slug, p.published_at, c.body_html AS html
       FROM page p JOIN content c ON c.id = p.published_revision_id
      WHERE p.deleted_at IS NULL AND p.published = 1
      ORDER BY 2, 1`,
  )
  .all()
  .map((row) => toPageRow(row))

const lines = [
  '# Production blog pages for the page-cost harness (tests/page_cost.rs).',
  `# ${rows.length} published posts and pages in publish order, one per line: sorted comma-separated uppercase hex codepoints.`,
  '# Scope: the characters the public theme renders in the post font slot — saved body text outside pre/code,',
  '#   form controls, svg and MathML, plus ordered-list markers. Codepoint sets only; no text is stored.',
  `# Source: a Kobato content database (the published revision of every live post and page), snapshot ${snapshotDate()}.`,
  '# Generator: pnpm --filter @kobato/font-split run fixture:blog <kobato.db> <this file>',
]
for (const row of rows) {
  lines.push(
    pageCodepoints(row.html)
      .map((cp) => cp.toString(16).toUpperCase())
      .join(','),
  )
}
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${lines.join('\n')}\n`)
process.stdout.write(`${outputPath}: ${rows.length} pages\n`)
