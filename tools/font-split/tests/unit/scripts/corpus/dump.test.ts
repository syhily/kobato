import { PageAssembler, parsePage, pageText, splitPage, xmlUnescape } from '@kobato/font-split/scripts/corpus/dump'
import { describe, expect, it } from 'vitest'

const utf8 = (text: string): Buffer => Buffer.from(text, 'utf8')

describe('xmlUnescape', () => {
  it('decodes named and numeric references', () => {
    expect(xmlUnescape('a &lt; b &amp; c &#x4E2D; &#20013;')).toBe('a < b & c 中 中')
    expect(xmlUnescape('plain')).toBe('plain')
    expect(xmlUnescape('keep &unknown; as-is')).toBe('keep &unknown; as-is')
    expect(xmlUnescape('&#xD800; &#x110000; &#38; &#x26;')).toBe('&#xD800; &#x110000; & &')
  })

  it('keeps an unterminated ampersand and the rest of the text', () => {
    expect(xmlUnescape('a & b')).toBe('a & b')
    expect(xmlUnescape('a &amp b')).toBe('a &amp b')
  })
})

describe('parsePage', () => {
  it('reads the page fields and unescapes title and text', () => {
    const blob = utf8(
      '<page>\n    <title>汉字</title>\n    <ns>0</ns>\n    <id>12345</id> <revision><id>99</id><text bytes="10" xml:space="preserve">正文 &lt;x&gt;</text></revision>\n  </page>',
    )
    const page = parsePage(blob)
    expect(page.id).toBe(12345)
    expect(page.ns).toBe(0)
    expect(page.redirect).toBe(false)
    expect(page.text).toBe('汉字\n正文 <x>')
  })

  it('reads a self-closing text tag and a redirect', () => {
    const page = parsePage(
      utf8(
        '<page><title>T</title><ns>0</ns><id>7</id><redirect title="x" /><revision><text bytes="0" /></revision></page>',
      ),
    )
    expect(page.redirect).toBe(true)
    expect(page.text).toBe('T\n')
  })

  it('falls back on missing or malformed fields', () => {
    const page = splitPage(utf8('<page><title>T</title></page>'))
    expect(page.id).toBe(0)
    expect(page.ns).toBe(-1)
    expect(pageText(utf8('甲\n乙'))).toBe('甲\n乙')
    expect(pageText(utf8('&#20013;\n文'))).toBe('中\n文')
    expect(pageText(utf8('\uFEFF中\n文'))).toBe('\uFEFF中\n文')
  })
})

describe('PageAssembler', () => {
  const xml = [
    '<mediawiki><page><title>甲</title><ns>0</ns><id>1</id><revision><text>正文一</text></revision></page>',
    '<page><title>乙</title><ns>0</ns><id>2</id><revision><text>正文二</text></revision></page>',
    '</mediawiki>',
  ].join('\n')

  it('reassembles pages across arbitrary chunk boundaries', () => {
    for (const size of [1, 2, 3, 7, 16, 64, 1000]) {
      const assembler = new PageAssembler()
      const pages: number[] = []
      const bytes = utf8(xml)
      for (let at = 0; at < bytes.length; at += size) {
        for (const page of assembler.push(bytes.subarray(at, at + size))) {
          pages.push(page.id)
          expect(pageText(page.bytes)).toBe(page.id === 1 ? '甲\n正文一' : '乙\n正文二')
        }
      }
      expect(pages, `chunk ${size}`).toEqual([1, 2])
    }
  })

  it('gives every page a buffer of its own so it can be transferred', () => {
    const [first, second] = new PageAssembler().push(utf8(xml))
    expect(first!.bytes.buffer).not.toBe(second!.bytes.buffer)
    expect(first!.bytes.byteOffset).toBe(0)
  })
})
