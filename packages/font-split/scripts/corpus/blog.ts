import type { SQLOutputValue } from 'node:sqlite'

import { trimEndWhiteSpace, trimWhiteSpace } from '@kobato/font-split/scripts/corpus/clean'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

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

interface Element {
  name: string
  items: number
}

const isAsciiAlphabetic = (code: number): boolean => (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
const isAsciiDigit = (code: number): boolean => code >= 0x30 && code <= 0x39

function numeric(value: number | null): number {
  return value !== null && value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? value : REPLACEMENT
}

function digits(text: string, radix: 10 | 16): number | null {
  if (!(radix === 16 ? /^[0-9A-Fa-f]+$/ : /^[0-9]+$/).test(text)) {
    return null
  }
  const value = Number.parseInt(text, radix)
  return Number.isSafeInteger(value) && value <= 0xffffffff ? value : null
}

function entity(text: string): { decoded: number; length: number } | null {
  const end = text.indexOf(';')
  if (end === -1) {
    return null
  }
  const body = text.slice(1, end)
  if (/^#[xX]/.test(body)) {
    return { decoded: numeric(digits(body.slice(2), 16)), length: end + 1 }
  }
  if (body.startsWith('#')) {
    const value = body.slice(1)
    return { decoded: numeric(digits(value.startsWith('+') ? value.slice(1) : value, 10)), length: end + 1 }
  }
  const [first, ...rest] = body
  if (
    first !== undefined &&
    isAsciiAlphabetic(first.charCodeAt(0)) &&
    rest.every((c) => isAsciiAlphabetic(c.charCodeAt(0)) || isAsciiDigit(c.charCodeAt(0)))
  ) {
    const named = NAMED_ENTITIES.get(body)
    if (named === undefined) {
      throw new Error(`unsupported HTML entity: &${body};`)
    }
    return { decoded: named.codePointAt(0)!, length: end + 1 }
  }
  return null
}

function decode(text: string): string {
  if (!text.includes('&')) {
    return text
  }
  let out = ''
  let at = 0
  let ampersand = text.indexOf('&', at)
  while (ampersand !== -1) {
    out += text.slice(at, ampersand)
    const found = entity(text.slice(ampersand))
    if (found === null) {
      out += '&'
      at = ampersand + 1
    } else {
      out += String.fromCodePoint(found.decoded)
      at = ampersand + found.length
    }
    ampersand = text.indexOf('&', at)
  }
  return out + text.slice(at)
}

function tagEnd(html: string, from: number): number {
  let quote = 0
  let at = from
  while (at < html.length) {
    const code = html.charCodeAt(at)
    if (quote !== 0) {
      if (code === quote) {
        quote = 0
      }
    } else if (code === 0x22 || code === 0x27) {
      quote = code
    } else if (code === 0x3e) {
      break
    }
    at += 1
  }
  return at
}

export function pageCodepoints(html: string): number[] {
  const found = new Set<number>()
  const stack: Element[] = []
  let skipFrom = Number.POSITIVE_INFINITY
  const add = (text: string): void => {
    for (const c of decode(text)) {
      found.add(c.codePointAt(0) ?? REPLACEMENT)
    }
  }
  const addText = (text: string): void => {
    if (text !== '' && stack.length < skipFrom) {
      add(text)
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
    if (top === undefined || top.name !== name) {
      throw new Error(`mismatched end tag </${name}> (open: ${top?.name ?? 'none'})`)
    }
    if (stack.length < skipFrom) {
      skipFrom = Number.POSITIVE_INFINITY
    }
  }

  let at = 0
  while (at < html.length) {
    const start = html.indexOf('<', at)
    if (start === -1) {
      addText(html.slice(at))
      break
    }
    addText(html.slice(at, start))
    const next = html.charCodeAt(start + 1)
    if (next === 0x21 || next === 0x3f) {
      const end = html.indexOf('>', start)
      at = end === -1 ? html.length : end + 1
    } else if (next === 0x2f) {
      const end = html.indexOf('>', start)
      close(trimWhiteSpace(html.slice(start + 2, end === -1 ? html.length : end)).toLowerCase())
      at = end === -1 ? html.length + 1 : end + 1
    } else if (isAsciiAlphabetic(next)) {
      const end = tagEnd(html, start + 1)
      const tag = html.slice(start + 1, end)
      at = end + 1
      let nameEnd = 0
      while (nameEnd < tag.length) {
        const code = tag.charCodeAt(nameEnd)
        if (!isAsciiAlphabetic(code) && !isAsciiDigit(code) && code !== 0x2d) {
          break
        }
        nameEnd += 1
      }
      open(tag.slice(0, nameEnd).toLowerCase(), trimEndWhiteSpace(tag).endsWith('/'))
    } else {
      addText('<')
      at = start + 1
    }
  }
  return [...found].sort((left, right) => left - right)
}

export interface PageRow {
  slug: string
  publishedAt: number
  html: string
}

const QUERY = `SELECT p.slug, p.published_at, c.body_html AS html
     FROM post p JOIN content c ON c.id = p.published_revision_id
    WHERE p.deleted_at IS NULL AND p.published = 1
    UNION ALL
    SELECT p.slug, p.published_at, c.body_html AS html
      FROM page p JOIN content c ON c.id = p.published_revision_id
     WHERE p.deleted_at IS NULL AND p.published = 1
     ORDER BY 2, 1`

function toPageRow(row: Record<string, SQLOutputValue>): PageRow {
  const { slug, html } = row
  const publishedAt = row.published_at
  const unexpected = (): Error =>
    new Error(
      `unexpected content row shape (slug: ${typeof slug}, published_at: ${typeof publishedAt}, html: ${typeof html})`,
    )
  if (typeof slug !== 'string' || typeof html !== 'string') {
    throw unexpected()
  }
  if (typeof publishedAt !== 'number' && typeof publishedAt !== 'bigint') {
    throw unexpected()
  }
  return { slug, publishedAt: Number(publishedAt), html }
}

function snapshotDate(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function blogFixture(rows: readonly PageRow[], date = new Date()): string {
  const lines = [
    '# Production blog pages for the page-cost harness (tests/page_cost.rs).',
    `# ${rows.length} published posts and pages in publish order, one per line: sorted comma-separated uppercase hex codepoints.`,
    '# Scope: the characters the public theme renders in the post font slot — saved body text outside pre/code,',
    '#   form controls, svg and MathML, plus ordered-list markers. Codepoint sets only; no text is stored.',
    `# Source: a Kobato content database (the published revision of every live post and page), snapshot ${snapshotDate(date)}.`,
    '# Generator: pnpm --filter @kobato/font-split run fixture:blog <kobato.db> <this file>',
  ]
  for (const row of rows) {
    const codepoints = pageCodepoints(row.html)
    lines.push(codepoints.map((cp) => cp.toString(16).toUpperCase()).join(','))
  }
  return `${lines.join('\n')}\n`
}

export function readPages(database: string): PageRow[] {
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    return db
      .prepare(QUERY)
      .all()
      .map((row) => toPageRow(row))
  } finally {
    db.close()
  }
}

export function blogPages(database: string, output: string, date = new Date()): number {
  const rows = readPages(database)
  const content = blogFixture(rows, date)
  if (dirname(output) !== '') {
    mkdirSync(dirname(output), { recursive: true })
  }
  writeFileSync(output, content)
  console.log(`${output}: ${rows.length} pages`)
  return rows.length
}
