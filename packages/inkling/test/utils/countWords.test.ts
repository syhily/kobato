import { countWords } from '@/utils/index'

describe('countWords', function () {
  it('counts plain words', function () {
    expect(countWords('Some words here')).toBe(3)
  })

  it('sanitizes HTML tags', function () {
    const html = '<p>This is a text example! Count me in ;)</p>'
    expect(countWords(html)).toBe(8)
  })

  it('sanitizes non alpha-numeric characters', function () {
    const html = '<p>This is a text example! I love Döner. Especially number 875.</p>'
    expect(countWords(html)).toBe(11)
  })

  it('counts Chinese characters', function () {
    const html = '<p>我今天在家吃了好多好多好吃的，现在的我非常开心非常满足</p>'
    expect(countWords(html)).toBe(26)
  })

  it('sanitizes whitespace correctly', function () {
    const html = ' <p> This is a text example!\n Count   me in ;)</p> '
    expect(countWords(html)).toBe(8)
  })

  it('counts Arabic characters', function () {
    const html = '<p>انا هذا رائع جدا يا صاح</p>'
    expect(countWords(html)).toBe(6)
  })

  it('counts Hebrew characters', function () {
    const html = '<p>מנסה לגרום לזה לעבוד</p>'
    expect(countWords(html)).toBe(4)
  })

  it('counts mixed Latin and RTL words together', function () {
    expect(countWords('hello مرحبا world')).toBe(3)
    expect(countWords('שלום friend مرحبا')).toBe(3)
  })

  it('returns 0 for empty / falsy input', function () {
    expect(countWords('')).toBe(0)
    expect(countWords(null)).toBe(0)
    expect(countWords(undefined)).toBe(0)
  })

  it('unwraps SafeString-like values via their string property', function () {
    expect(countWords({ string: 'one two three' })).toBe(3)
  })
})

describe('countWords with a language (C7 — Intl.Segmenter)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('counts Chinese by word, not by character', function () {
    const text = '我今天在家吃了好多好多好吃的，现在的我非常开心非常满足'
    // the legacy regex path counts every CJK character (26); the segmenter
    // path counts dictionary words
    expect(countWords(text)).toBe(26)
    expect(countWords(text, 'zh')).toBe(15)
  })

  it('counts Japanese by word', function () {
    expect(countWords('私は今日家でたくさんのおいしいものを食べました', 'ja')).toBe(14)
  })

  it('pins the English segmenter semantics (contractions stay one word)', function () {
    // the regex path splits "don't" into "don" + "t"; the segmenter keeps it
    expect(countWords("don't stop")).toBe(3)
    expect(countWords("don't stop", 'en')).toBe(2)
  })

  it('still strips HTML before segmenting', function () {
    expect(countWords('<p>你好世界</p>', 'zh')).toBe(2)
  })

  it('falls back to the regex path when Intl.Segmenter is unavailable', function () {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined })
    const text = '我今天在家吃了好多好多好吃的，现在的我非常开心非常满足'
    expect(countWords(text, 'zh')).toBe(26)
  })
})
