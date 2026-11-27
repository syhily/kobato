import {
  escapeHtml,
  faceIndexesFor,
  facesBytes,
  loadPackage,
  loadPages,
  pageHtml,
  parseUnicodeRange,
} from '@kobato/font-split/scripts/bench/suite/package'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-bench-package-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function writePackage(dir: string, css: string, faces: string[]): void {
  writeFileSync(join(dir, 'result.css'), css)
  for (const face of faces) {
    writeFileSync(join(dir, face), 'wOF2-face')
  }
}

const CSS =
  '/* header */\n' +
  '@font-face{font-family:"OPPO Serif SC";src:local("OPPO Serif SC"),url("./a.woff2")format("woff2");font-style:normal;font-display:swap;font-weight:300 700;unicode-range:U+20-7F,U+A1-A2;}' +
  '@font-face{font-family:"OPPO Serif SC";src:local("OPPO Serif SC"),url("./b.woff2")format("woff2");font-style:normal;font-display:swap;font-weight:300 700;unicode-range:U+4E00-4E8C,U+3002;}'

describe('font-split package model', () => {
  it('parses unicode-range tokens', () => {
    expect(parseUnicodeRange('U+20-7F,U+A1-A2')).toEqual([
      { lo: 0x20, hi: 0x7f },
      { lo: 0xa1, hi: 0xa2 },
    ])
    expect(parseUnicodeRange('U+3002')).toEqual([{ lo: 0x3002, hi: 0x3002 }])
    expect(parseUnicodeRange('u+4e??')).toEqual([{ lo: 0x4e00, hi: 0x4eff }])
    expect(() => parseUnicodeRange('U+ZZZZ')).toThrow(/bad unicode-range token/)
  })

  it('loads a sliced package with its face sizes and rejects orphans', () => {
    const dir = tempDir()
    writePackage(dir, CSS, ['a.woff2', 'b.woff2'])
    const pkg = loadPackage(dir)
    expect(pkg.family).toBe('OPPO Serif SC')
    expect(pkg.fontWeight).toBe('300 700')
    expect(pkg.cssBytes).toBe(Buffer.byteLength(CSS))
    expect(pkg.faces.map((face) => [face.file, face.bytes])).toEqual([
      ['a.woff2', 9],
      ['b.woff2', 9],
    ])
    expect([...pkg.files.keys()]).toEqual(['result.css', 'a.woff2', 'b.woff2'])

    writeFileSync(join(dir, 'orphan.woff2'), 'wOF2-orphan')
    expect(() => loadPackage(dir)).toThrow(/orphan\.woff2 is on disk but not in result\.css/)

    writePackage(dir, '@font-face{font-family:"X";font-weight:400;unicode-range:U+0;}', [])
    expect(() => loadPackage(dir)).toThrow(/without a url or a unicode-range/)
    writePackage(dir, '@font-face{font-weight:400;src:url("./a.woff2");unicode-range:U+0;}', ['a.woff2'])
    expect(() => loadPackage(dir)).toThrow(/no font family/)
  })

  it('predicts the faces a page touches from the offline rule', () => {
    const dir = tempDir()
    writePackage(dir, CSS, ['a.woff2', 'b.woff2'])
    const pkg = loadPackage(dir)
    expect(faceIndexesFor(pkg, [0x41, 0x4e00, 0x3002])).toEqual([0, 1])
    expect(faceIndexesFor(pkg, [0x4e8c, 0x7e])).toEqual([0, 1])
    expect(faceIndexesFor(pkg, [0x1234])).toEqual([])
    expect(facesBytes(pkg, [0, 1])).toBe(18)
  })

  it('renders a page as the codepoint set of a blog document and escapes it', () => {
    const dir = tempDir()
    writePackage(dir, CSS, ['a.woff2', 'b.woff2'])
    const html = pageHtml(loadPackage(dir), '/pkg/l55000/result.css', [0x3c, 0x26, 0x4e00, 0x0a, 0x20])
    expect(html).toContain('<link rel="stylesheet" href="/pkg/l55000/result.css">')
    expect(html).toContain('font-family:"OPPO Serif SC"')
    expect(html).toContain('<span>&lt;</span><span>&amp;</span><span>一</span><span> </span>')
    expect(html).not.toContain('<span>\n</span>')
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href="x"&gt;&amp;&lt;/a&gt;')
  })

  it('loads page corpora as sorted-by-line codepoint sets', () => {
    const dir = tempDir()
    const path = join(dir, 'pages.txt')
    writeFileSync(path, '# fixture\n\n30,2D,4E00\n7F,20\n')
    expect(loadPages(path)).toEqual([
      [0x30, 0x2d, 0x4e00],
      [0x7f, 0x20],
    ])
  })
})
