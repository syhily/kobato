import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface CodepointRange {
  lo: number
  hi: number
}

export interface Face {
  file: string
  ranges: CodepointRange[]
  bytes: number
}

export interface SlicedPackage {
  family: string
  fontWeight: string
  cssBytes: number
  files: Map<string, Buffer>
  faces: Face[]
}

const TOKEN = /^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i

export function parseUnicodeRange(text: string): CodepointRange[] {
  return text.split(',').map((raw) => {
    const token = raw.trim()
    const match = TOKEN.exec(token)
    if (match === null) {
      throw new Error(`bad unicode-range token: ${token}`)
    }
    const [, first, last] = match
    if (last !== undefined) {
      return { lo: Number.parseInt(first!, 16), hi: Number.parseInt(last, 16) }
    }
    if (first!.includes('?')) {
      return {
        lo: Number.parseInt(first!.replaceAll('?', '0'), 16),
        hi: Number.parseInt(first!.replaceAll('?', 'F'), 16),
      }
    }
    return { lo: Number.parseInt(first!, 16), hi: Number.parseInt(first!, 16) }
  })
}

interface CssFace {
  file: string
  ranges: CodepointRange[]
}

function parseResultCss(css: string): { family: string; fontWeight: string; faces: CssFace[] } {
  const family = /@font-face\{font-family:"([^"]+)"/.exec(css)?.[1]
  const fontWeight = /font-weight:([^;]+);/.exec(css)?.[1]
  if (family === undefined || fontWeight === undefined) {
    throw new Error('result.css carries no font family or weight')
  }
  const faces = css
    .split('@font-face{')
    .slice(1)
    .map((face) => {
      const file = /url\("([^"]+)"\)/.exec(face)?.[1]
      const range = /unicode-range:([^;]+);/.exec(face)?.[1]
      if (file === undefined || range === undefined) {
        throw new Error(`result.css carries a face without a url or a unicode-range: ${face.slice(0, 80)}`)
      }
      return { file: file.slice(file.lastIndexOf('/') + 1), ranges: parseUnicodeRange(range) }
    })
  return { family, fontWeight, faces }
}

export function loadPackage(dir: string): SlicedPackage {
  const cssBuffer = readFileSync(join(dir, 'result.css'))
  const { family, fontWeight, faces } = parseResultCss(cssBuffer.toString('utf8'))
  const files = new Map<string, Buffer>([['result.css', cssBuffer]])
  for (const face of faces) {
    files.set(face.file, readFileSync(join(dir, face.file)))
  }
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.woff2') && !files.has(name)) {
      throw new Error(`${join(dir, name)} is on disk but not in result.css`)
    }
  }
  return {
    family,
    fontWeight,
    cssBytes: cssBuffer.length,
    files,
    faces: faces.map((face) => ({ file: face.file, ranges: face.ranges, bytes: statSync(join(dir, face.file)).size })),
  }
}

export function faceIndexesFor(pkg: SlicedPackage, codepoints: readonly number[]): number[] {
  const hit = new Set<number>()
  for (const codepoint of codepoints) {
    const index = pkg.faces.findIndex((face) => face.ranges.some(({ lo, hi }) => codepoint >= lo && codepoint <= hi))
    if (index !== -1) {
      hit.add(index)
    }
  }
  return [...hit].sort((left, right) => left - right)
}

export function facesBytes(pkg: SlicedPackage, indexes: readonly number[]): number {
  return indexes.reduce((total, index) => total + pkg.faces[index]!.bytes, 0)
}

const UNRENDERABLE = (codepoint: number): boolean =>
  codepoint < 0x20 || (codepoint >= 0x7f && codepoint < 0xa0) || [0x200b, 0x200c, 0x200d, 0xfeff].includes(codepoint)

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function pageHtml(pkg: SlicedPackage, stylesheet: string, codepoints: readonly number[]): string {
  const spans = codepoints
    .filter((codepoint) => !UNRENDERABLE(codepoint))
    .map((codepoint) => `<span>${escapeHtml(String.fromCodePoint(codepoint))}</span>`)
    .join('')
  return (
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    `<link rel="stylesheet" href="${stylesheet}">` +
    '<style>html{background:#fff}body{margin:0}' +
    `#t{font-family:"${pkg.family}";font-size:16px;line-height:24px;width:800px;word-break:break-all}` +
    `#t span{white-space:pre}</style></head><body><div id="t">${spans}</div></body></html>`
  )
}

export function loadPages(path: string): number[][] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split(',').map((token) => Number.parseInt(token.trim(), 16)))
}
