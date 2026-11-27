export type Dim = 'hans' | 'hant'

const DROP_TAGS = ['ref', 'math', 'source', 'syntaxhighlight', 'timeline', 'graph', 'score']

const DROP_LINK_PREFIXES = [
  'file:',
  'image:',
  'media:',
  'category:',
  '分类:',
  '分類:',
  '文件:',
  '檔案:',
  '图像:',
  '圖像:',
]

const CONVERSION_FLAG_CHARS = 'TARDHN-'
const HANS_KEYS = new Set(['zh-hans', 'zh-cn', 'zh-sg', 'zh-my'])
const HANT_KEYS = new Set(['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo'])

export const trimEndWhiteSpace = (s: string): string => s.replace(/\p{White_Space}+$/u, '')

export const trimStartWhiteSpace = (s: string): string => s.replace(/^\p{White_Space}+/u, '')

export const trimWhiteSpace = (s: string): string =>
  s.replace(/^\p{White_Space}+/u, '').replace(/\p{White_Space}+$/u, '')

function splitInclusive(s: string, separator: string): string[] {
  return s.match(new RegExp(`[^${separator}]*${separator}|[^${separator}]+`, 'g')) ?? []
}

export function cleanWikitext(raw: string, dim: Dim): string {
  let s = stripComments(raw)
  s = rewriteConversionBlocks(s, dim)
  for (const tag of DROP_TAGS) {
    s = dropTagBlocks(s, tag)
  }
  s = dropTemplates(s)
  s = dropTables(s)
  s = rewriteLinks(s)
  s = rewriteExternalLinks(s)
  s = stripLineMarkup(s)
  s = stripGenericTags(s)
  s = decodeEntities(s)
  return collapseWhitespace(s)
}

function stripComments(s: string): string {
  if (!s.includes('<!--')) {
    return s
  }
  let out = ''
  let rest = s
  let open = rest.indexOf('<!--')
  while (open !== -1) {
    out += `${rest.slice(0, open)} `
    const close = rest.indexOf('-->', open + 4)
    rest = close === -1 ? '' : rest.slice(close + 3)
    open = rest.indexOf('<!--')
  }
  return out + rest
}

function rewriteConversionBlocks(s: string, dim: Dim): string {
  if (!s.includes('-{')) {
    return s
  }
  let out = ''
  let rest = s
  let open = rest.indexOf('-{')
  while (open !== -1) {
    out += rest.slice(0, open)
    const close = rest.indexOf('}-', open + 2)
    if (close === -1) {
      out += rest.slice(open)
      return out
    }
    out += pickFromBlock(rest.slice(open + 2, close), dim)
    rest = rest.slice(close + 2)
    open = rest.indexOf('-{')
  }
  return out + rest
}

function pickFromBlock(inner: string, dim: Dim): string {
  const bar = inner.indexOf('|')
  const flags = bar === -1 ? '' : inner.slice(0, bar)
  const flagged =
    bar !== -1 && flags !== '' && Array.from(flags).every((c) => CONVERSION_FLAG_CHARS.includes(c.toUpperCase()))
  const body = flagged ? inner.slice(bar + 1) : inner
  let picked = ''
  let common = ''
  for (const field of body.split(';')) {
    const colon = field.indexOf(':')
    if (colon === -1) {
      common += field
      continue
    }
    const key = trimWhiteSpace(field.slice(0, colon)).toLowerCase()
    const serve = HANS_KEYS.has(key) ? dim === 'hans' : HANT_KEYS.has(key) ? dim === 'hant' : key === 'zh' ? true : null
    if (serve === null) {
      common += field
    } else if (serve) {
      picked += field.slice(colon + 1)
    }
  }
  return picked === '' ? common : picked
}

function dropTagBlocks(s: string, tag: string): string {
  const open = `<${tag}`
  const close = `</${tag}>`
  if (!s.includes(open)) {
    return s
  }
  let out = ''
  let rest = s
  let at = rest.indexOf(open)
  while (at !== -1) {
    const after = rest[at + open.length] ?? ' '
    if (after !== ' ' && after !== '/' && after !== '>' && after !== '\t' && after !== '\n') {
      out += rest.slice(0, at + 1)
      rest = rest.slice(at + 1)
      at = rest.indexOf(open)
      continue
    }
    out += `${rest.slice(0, at)} `
    const tail = rest.slice(at)
    const gt = tail.indexOf('>')
    if (gt === -1) {
      rest = ''
    } else if (tail.slice(0, gt).endsWith('/')) {
      rest = tail.slice(gt + 1)
    } else {
      const end = tail.indexOf(close)
      rest = end === -1 ? tail.slice(gt + 1) : tail.slice(end + close.length)
    }
    at = rest.indexOf(open)
  }
  return out + rest
}

function dropTemplates(s: string): string {
  if (!s.includes('{{')) {
    return s
  }
  let out = ''
  let i = 0
  let copyFrom = 0
  let depth = 0
  while (i + 1 < s.length) {
    const first = s.charCodeAt(i)
    const second = s.charCodeAt(i + 1)
    if (depth === 0) {
      if (first === 0x7b && second === 0x7b) {
        out += `${s.slice(copyFrom, i)} `
        depth = 1
        i += 2
      } else {
        i += 1
      }
    } else if (first === 0x7b && second === 0x7b) {
      depth += 1
      i += 2
    } else if (first === 0x7d && second === 0x7d) {
      depth -= 1
      i += 2
      if (depth === 0) {
        copyFrom = i
      }
    } else {
      i += 1
    }
  }
  if (depth === 0 && copyFrom < s.length) {
    out += s.slice(copyFrom)
  }
  return out
}

function dropTables(s: string): string {
  if (!s.includes('{|')) {
    return s
  }
  let out = ''
  let inTable = false
  for (const line of splitInclusive(s, '\n')) {
    const trimmed = trimStartWhiteSpace(line)
    if (!inTable && trimmed.startsWith('{|')) {
      inTable = true
      continue
    }
    if (inTable) {
      if (trimmed.startsWith('|}')) {
        inTable = false
      }
      continue
    }
    out += line
  }
  return out
}

function rewriteLinks(s: string): string {
  if (!s.includes('[[')) {
    return s
  }
  let out = ''
  let rest = s
  let open = rest.indexOf('[[')
  while (open !== -1) {
    out += rest.slice(0, open)
    const close = rest.indexOf(']]', open + 2)
    if (close === -1) {
      out += rest.slice(open)
      return out
    }
    const inner = rest.slice(open + 2, close)
    const first = inner.indexOf('|')
    const target = trimWhiteSpace(first === -1 ? inner : inner.slice(0, first)).toLowerCase()
    if (DROP_LINK_PREFIXES.some((prefix) => target.startsWith(prefix))) {
      out += ' '
    } else {
      out += inner.slice(inner.lastIndexOf('|') + 1)
    }
    rest = rest.slice(close + 2)
    open = rest.indexOf('[[')
  }
  return out + rest
}

function rewriteExternalLinks(s: string): string {
  if (!s.includes('[')) {
    return s
  }
  let out = ''
  let rest = s
  let open = rest.indexOf('[')
  while (open !== -1) {
    out += rest.slice(0, open)
    const close = rest.indexOf(']', open + 1)
    if (close === -1) {
      out += rest.slice(open)
      return out
    }
    const inner = rest.slice(open + 1, close)
    if (inner.startsWith('http://') || inner.startsWith('https://') || inner.startsWith('//')) {
      const label = inner.search(/\s/)
      out += label === -1 ? ' ' : trimWhiteSpace(inner.slice(label + 1))
    } else {
      out += `[${inner}]`
    }
    rest = rest.slice(close + 1)
    open = rest.indexOf('[')
  }
  return out + rest
}

function stripLineMarkup(s: string): string {
  const unquoted = s.replaceAll("'''", '').replaceAll("''", '')
  let out = ''
  for (const line of splitInclusive(unquoted, '\n')) {
    const marked = line.replace(/^[*#;:]+/, '')
    const trimmed = trimWhiteSpace(marked)
    if (trimmed.startsWith('==') && trimmed.endsWith('==') && trimmed.length > 4) {
      out += `${trimWhiteSpace(trimmed.replace(/^=+|=+$/g, ''))}\n`
    } else {
      out += marked
    }
  }
  return out
}

function stripGenericTags(s: string): string {
  if (!s.includes('<')) {
    return s
  }
  let out = ''
  let rest = s
  let open = rest.indexOf('<')
  while (open !== -1) {
    const next = rest.charCodeAt(open + 1)
    const isTag = (next >= 0x41 && next <= 0x5a) || (next >= 0x61 && next <= 0x7a) || next === 0x2f
    const close = rest.indexOf('>', open)
    if (isTag && close !== -1) {
      out += `${rest.slice(0, open)} `
      rest = rest.slice(close + 1)
    } else {
      out += rest.slice(0, open + 1)
      rest = rest.slice(open + 1)
    }
    open = rest.indexOf('<')
  }
  return out + rest
}

export function parseUnsigned(text: string, radix: 10 | 16): number | null {
  const digits = text.startsWith('+') ? text.slice(1) : text
  if (!(radix === 16 ? /^[0-9A-Fa-f]+$/ : /^[0-9]+$/).test(digits)) {
    return null
  }
  const value = Number.parseInt(digits, radix)
  return Number.isSafeInteger(value) && value <= 0xffffffff ? value : null
}

export function charFromCodepoint(value: number | null): string | null {
  if (value === null || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return null
  }
  return String.fromCodePoint(value)
}

function decodeEntities(s: string): string {
  if (!s.includes('&')) {
    return s
  }
  let out = ''
  let rest = s
  let at = rest.indexOf('&')
  while (at !== -1) {
    const semi = rest.indexOf(';', at + 1)
    if (semi === -1) {
      break
    }
    const entity = rest.slice(at + 1, semi)
    const decoded = entity === '' || entity.length > 10 ? null : decodeEntity(entity)
    if (decoded !== null) {
      out += rest.slice(0, at) + decoded
      rest = rest.slice(semi + 1)
    } else {
      out += rest.slice(0, at + 1)
      rest = rest.slice(at + 1)
    }
    at = rest.indexOf('&')
  }
  return out + rest
}

const NAMED_ENTITIES = new Map([
  ['nbsp', ' '],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
])

function decodeEntity(entity: string): string | null {
  if (!entity.startsWith('#')) {
    return NAMED_ENTITIES.get(entity) ?? null
  }
  const hex = /^#[xX]/.test(entity)
  return charFromCodepoint(parseUnsigned(entity.slice(hex ? 2 : 1), hex ? 16 : 10))
}

function collapseWhitespace(s: string): string {
  let out = ''
  let pendingSpace = false
  for (const c of s) {
    if (/\p{White_Space}/u.test(c)) {
      pendingSpace = true
    } else {
      if (pendingSpace && out !== '') {
        out += ' '
      }
      pendingSpace = false
      out += c
    }
  }
  return out
}
