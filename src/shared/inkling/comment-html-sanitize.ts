import type { StandardDecorator } from '@/shared/pt/schema'

import { isValidCommentLinkUrl } from '@/shared/pt/comment-schema'
import { STANDARD_DECORATORS } from '@/shared/pt/schema'

export type SanitizeToken =
  | { kind: 'text'; text: string; decorators: StandardDecorator[] }
  | { kind: 'linebreak' }
  | { kind: 'paragraph-split' }
  | {
      kind: 'link'
      text: string
      decorators: StandardDecorator[]
      url: string
      rel?: string
      title?: string
      target?: string
    }

type TagKind = 'open' | 'close' | 'self'

interface TagToken {
  kind: TagKind
  name: string
  attrs: Map<string, string>
}

interface TextToken {
  kind: 'text'
  text: string
}

type LexToken = TextToken | TagToken

const VOID_TAGS = new Set<string>([
  'br',
  'hr',
  'img',
  'input',
  'meta',
  'link',
  'col',
  'area',
  'base',
  'embed',
  'source',
  'track',
  'wbr',
  'param',
])

const FORMAT_TAG_MAP: Record<string, StandardDecorator> = {
  b: 'strong',
  strong: 'strong',
  i: 'em',
  em: 'em',
  u: 'underline',
  s: 'strike-through',
  strike: 'strike-through',
  del: 'strike-through',
  code: 'code',
}

const VALID_LINK_TARGETS = new Set<string>(['_blank', '_self', '_parent', '_top'])

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f'
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:([a-zA-Z][a-zA-Z0-9]*);|#(\d+);|#x([0-9a-fA-F]+);)/g,
    (_match, name: string | undefined, dec: string | undefined, hex: string | undefined) => {
      if (name !== undefined) {
        const mapped = HTML_ENTITY_MAP[name]
        if (mapped !== undefined) {
          return mapped
        }
      } else if (dec !== undefined) {
        const code = Number.parseInt(dec, 10)
        if (!Number.isNaN(code)) {
          return String.fromCodePoint(code)
        }
      } else if (hex !== undefined) {
        const code = Number.parseInt(hex, 16)
        if (!Number.isNaN(code)) {
          return String.fromCodePoint(code)
        }
      }
      return _match
    },
  )
}

function mergeDecorators(
  parentDecorators: readonly StandardDecorator[],
  activeDecorators: readonly StandardDecorator[],
): StandardDecorator[] {
  const set = new Set([...parentDecorators, ...activeDecorators])
  return STANDARD_DECORATORS.filter((d) => set.has(d))
}

function parseTag(text: string, start: number): { token: TagToken; nextIndex: number } | null {
  let i = start
  const len = text.length
  if (text[i] !== '<') {
    return null
  }
  i += 1

  let isClose = false
  if (i < len && text[i] === '/') {
    isClose = true
    i += 1
  }

  const nameStart = i
  while (i < len && /[a-zA-Z]/.test(text[i])) {
    i += 1
  }
  if (i === nameStart) {
    return null
  }
  const name = text.slice(nameStart, i).toLowerCase()

  // Comments are not recognised as tags; fall back to literal text.
  if (name.startsWith('!')) {
    return null
  }

  const attrs = new Map<string, string>()
  let closed = false
  let selfClosing = false

  while (i < len) {
    // End of tag.
    if (text[i] === '>') {
      i += 1
      closed = true
      break
    }

    // Self-closing end.
    if (text[i] === '/' && i + 1 < len && text[i + 1] === '>') {
      i += 2
      selfClosing = true
      break
    }

    if (isWhitespace(text[i])) {
      i += 1
      continue
    }

    // Attribute name.
    const attrNameStart = i
    while (i < len && /[a-zA-Z0-9-]/.test(text[i])) {
      i += 1
    }
    if (i === attrNameStart) {
      return null
    }
    const attrName = text.slice(attrNameStart, i).toLowerCase()

    while (i < len && isWhitespace(text[i])) {
      i += 1
    }

    let value = ''
    if (i < len && text[i] === '=') {
      i += 1
      while (i < len && isWhitespace(text[i])) {
        i += 1
      }

      if (i < len && (text[i] === '"' || text[i] === "'")) {
        const quote = text[i]
        i += 1
        const valueStart = i
        while (i < len && text[i] !== quote) {
          i += 1
        }
        value = text.slice(valueStart, i)
        if (i < len) {
          i += 1
        }
      } else {
        const valueStart = i
        while (i < len && text[i] !== '>' && !isWhitespace(text[i])) {
          i += 1
        }
        value = text.slice(valueStart, i)
      }
    }

    attrs.set(attrName, value)
  }

  if (!closed && !selfClosing) {
    return null
  }

  if (isClose) {
    return { token: { kind: 'close', name, attrs: new Map() }, nextIndex: i }
  }

  if (selfClosing || VOID_TAGS.has(name)) {
    return { token: { kind: 'self', name, attrs }, nextIndex: i }
  }

  return { token: { kind: 'open', name, attrs }, nextIndex: i }
}

function lex(text: string): LexToken[] {
  const tokens: LexToken[] = []
  let i = 0
  const len = text.length

  while (i < len) {
    if (text[i] !== '<') {
      const start = i
      while (i < len && text[i] !== '<') {
        i += 1
      }
      tokens.push({ kind: 'text', text: text.slice(start, i) })
      continue
    }

    const parsed = parseTag(text, i)
    if (parsed === null) {
      tokens.push({ kind: 'text', text: '<' })
      i += 1
    } else {
      tokens.push(parsed.token)
      i = parsed.nextIndex
    }
  }

  return tokens
}

function flattenTextBetween(
  tokens: readonly LexToken[],
  start: number,
  end: number,
  matchedClose: readonly (number | undefined)[],
): string {
  let text = ''
  let i = start
  while (i < end) {
    const t = tokens[i]!
    if (t.kind === 'text') {
      text += t.text
    } else if (t.kind === 'self' && t.name === 'br') {
      text += '\n'
    } else if (t.kind === 'open') {
      const closeIdx = matchedClose[i]
      if (closeIdx !== undefined && closeIdx <= end) {
        text += flattenTextBetween(tokens, i + 1, closeIdx, matchedClose)
        i = closeIdx
      }
    }
    i += 1
  }
  return text
}

function pairTags(tokens: readonly LexToken[]): {
  matchedClose: (number | undefined)[]
  matchedOpen: (number | undefined)[]
} {
  const n = tokens.length
  const matchedClose: (number | undefined)[] = Array.from({ length: n }, () => undefined)
  const matchedOpen: (number | undefined)[] = Array.from({ length: n }, () => undefined)
  const stack: { idx: number; name: string }[] = []

  for (let i = 0; i < n; i += 1) {
    const t = tokens[i]!
    if (t.kind === 'open') {
      stack.push({ idx: i, name: t.name })
    } else if (t.kind === 'close') {
      let found = -1
      for (let k = stack.length - 1; k >= 0; k -= 1) {
        if (stack[k]!.name === t.name) {
          found = k
          break
        }
      }
      if (found !== -1) {
        const openIdx = stack[found]!.idx
        matchedClose[openIdx] = i
        matchedOpen[i] = openIdx
        stack.splice(found)
      }
    }
  }

  return { matchedClose, matchedOpen }
}

function makeLinkToken(
  attrs: Map<string, string>,
  innerText: string,
  /** Pre-decoded and validated URL (caller must decode entities before validating). */
  url: string,
  decorators: StandardDecorator[],
): SanitizeToken {
  const rel = attrs.get('rel')
  const title = attrs.get('title')
  const rawTarget = attrs.get('target')
  const target = rawTarget !== undefined && VALID_LINK_TARGETS.has(rawTarget) ? rawTarget : undefined

  const token: SanitizeToken = {
    kind: 'link',
    text: decodeEntities(innerText),
    decorators,
    url,
  }
  if (rel !== undefined && rel.length > 0) {
    token.rel = rel
  }
  if (title !== undefined && title.length > 0) {
    token.title = title
  }
  if (target !== undefined) {
    token.target = target
  }
  return token
}

export function sanitizeCommentSpanText(text: string, parentDecorators: StandardDecorator[]): SanitizeToken[] {
  const tokens = lex(text)
  const { matchedClose, matchedOpen } = pairTags(tokens)
  const out: SanitizeToken[] = []
  const active: StandardDecorator[] = []

  let i = 0
  const n = tokens.length
  while (i < n) {
    const t = tokens[i]!

    if (t.kind === 'text') {
      out.push({
        kind: 'text',
        text: decodeEntities(t.text),
        decorators: mergeDecorators(parentDecorators, active),
      })
      i += 1
      continue
    }

    if (t.kind === 'open') {
      const closeIdx = matchedClose[i]

      if (t.name === 'a') {
        if (closeIdx !== undefined) {
          const rawHref = t.attrs.get('href')
          if (rawHref !== undefined) {
            // Must decode entities BEFORE validation so entity-encoded
            // attacks (e.g. javas&#99;ript:alert(1)) are caught.
            // Browsers decode entities when parsing the href attribute,
            // so checking only the raw value misses this class of bypass.
            const decodedHref = decodeEntities(rawHref).trim()
            if (decodedHref.length > 0 && isValidCommentLinkUrl(decodedHref)) {
              const innerText = flattenTextBetween(tokens, i + 1, closeIdx, matchedClose)
              out.push(makeLinkToken(t.attrs, innerText, decodedHref, mergeDecorators(parentDecorators, active)))
              i = closeIdx + 1
              continue
            }
          }
        }
        // Orphan <a> or invalid href: strip the opening tag, keep the inner text.
        i += 1
        continue
      }

      if (t.name === 'p') {
        if (closeIdx !== undefined) {
          out.push({ kind: 'paragraph-split' })
        }
        i += 1
        continue
      }

      const decorator = FORMAT_TAG_MAP[t.name]
      if (decorator !== undefined && closeIdx !== undefined) {
        active.push(decorator)
        i += 1
        continue
      }

      // Any other tag is stripped; its inner text is processed normally.
      i += 1
      continue
    }

    if (t.kind === 'close') {
      const openIdx = matchedOpen[i]
      if (openIdx !== undefined) {
        const openToken = tokens[openIdx]
        if (openToken.kind !== 'text') {
          if (openToken.name === 'p') {
            out.push({ kind: 'paragraph-split' })
          } else {
            const decorator = FORMAT_TAG_MAP[openToken.name]
            if (decorator !== undefined) {
              const idx = active.lastIndexOf(decorator)
              if (idx !== -1) {
                active.splice(idx, 1)
              }
            }
          }
        }
      }
      i += 1
      continue
    }

    if (t.kind === 'self') {
      if (t.name === 'br' || t.name === 'hr') {
        out.push({ kind: 'linebreak' })
      } else if (t.name === 'img') {
        const rawAlt = t.attrs.get('alt')
        if (rawAlt !== undefined && rawAlt.trim().length > 0) {
          out.push({
            kind: 'text',
            text: decodeEntities(rawAlt).trim(),
            decorators: parentDecorators,
          })
        } else {
          // Image nodes are forbidden in comments. When there is no alt text,
          // preserve the existence of the image with a placeholder so a
          // historically-non-empty comment does not become empty.
          out.push({
            kind: 'text',
            text: '[图片]',
            decorators: parentDecorators,
          })
        }
      }
      i += 1
      continue
    }
  }

  return out
}
