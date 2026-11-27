import { charFromCodepoint, cleanWikitext, parseUnsigned } from '@kobato/font-split/scripts/corpus/clean'
import { describe, expect, it } from 'vitest'

describe('cleanWikitext', () => {
  it('removes comments, templates and drop tags', () => {
    expect(cleanWikitext('正文<!-- 注释 -->{{Infobox|name=测试}}开头<ref>参考资料</ref>结尾', 'hans')).toBe(
      '正文 开头 结尾',
    )
  })

  it('drops nested templates', () => {
    expect(cleanWikitext('甲{{a|{{b|x}}}}乙', 'hans')).toBe('甲 乙')
  })

  it('keeps the display text of links', () => {
    expect(cleanWikitext('见[[中国|中国大陆]]与[[历史]]条目', 'hans')).toBe('见中国大陆与历史条目')
    expect(cleanWikitext('图[[File:x.jpg|说明文字]]片', 'hans')).toBe('图 片')
    expect(cleanWikitext('[[分类:地名]]正文', 'hans')).toBe('正文')
  })

  it('picks the script dimension out of conversion blocks', () => {
    const raw = '简体字-{zh-hans:计算机;zh-hant:電腦}-和-{zh-hans:网络;zh-hant:網路}-'
    expect(cleanWikitext(raw, 'hans')).toBe('简体字计算机和网络')
    expect(cleanWikitext(raw, 'hant')).toBe('简体字電腦和網路')
  })

  it('reads flags and raw text of conversion blocks', () => {
    expect(cleanWikitext('-{A|zh-hans:甲;zh-hant:乙}-', 'hans')).toBe('甲')
    expect(cleanWikitext('-{共同文本}-', 'hant')).toBe('共同文本')
  })

  it('unmarks headings, lists and quotes', () => {
    expect(cleanWikitext("== 历史 ==\n* '''项目'''一", 'hans')).toBe('历史 项目一')
  })

  it('keeps the label of external links only', () => {
    expect(cleanWikitext('见[https://example.com 示例站点]及[https://a.b]', 'hans')).toBe('见示例站点及')
  })

  it('drops tables', () => {
    expect(cleanWikitext('前\n{| class="wikitable"\n| 单元格\n|}\n后', 'hans')).toBe('前 后')
  })

  it('strips generic tags but not a prose less-than sign', () => {
    expect(cleanWikitext('a<br/>b 1 < 2', 'hans')).toBe('a b 1 < 2')
  })

  it('decodes entities and keeps unknown ones', () => {
    expect(cleanWikitext('a&nbsp;b&#x4E2D;', 'hans')).toBe('a b中')
    expect(cleanWikitext('a&unknown;b&#x110000;c&#20013;', 'hans')).toBe('a&unknown;b&#x110000;c中')
  })
})

describe('cleanWikitext against the Rust reference', () => {
  it.each([
    ['a&#x4E2D;', 'a中'],
    ['&#X41;', 'A'],
    ['&#+65;', 'A'],
    ['&#65;', 'A'],
    ['a&b;c', 'a&b;c'],
    ['&amp', '&amp'],
    ['&#0;', '\0'],
    ['&#xD800;', '&#xD800;'],
    ['甲&#x10FFFF;', '甲\u{10ffff}'],
    ['&nbsp;x&nbsp;', 'x'],
    ['1 < 2 <br>x', '1 < 2 x'],
    ['==中==', '中'],
    ['== 中 ==', '中'],
    ["a''b'''c'''d", 'abcd'],
    ['*#:x', 'x'],
    ['「&quot;」', '「"」'],
    ['[[a|b|c]]', 'c'],
    ['[[File:x|y]]z', 'z'],
    ['[https://a.b  label ]', 'label'],
    ['[https://a.b]', ''],
    ['[not-a-link]', '[not-a-link]'],
    ['甲乙和-{zh-hans:丙;zh-hant:夆}-丁', '甲乙和丙丁'],
  ])('%s => %s', (raw, expected) => {
    expect(cleanWikitext(raw, 'hans')).toBe(expected)
  })
})

describe('U+FEFF', () => {
  it('is an ordinary character, as in Rust — neither whitespace nor stripped', () => {
    expect(cleanWikitext('\uFEFF中\uFEFF', 'hans')).toBe('\uFEFF中\uFEFF')
    expect(cleanWikitext('== \uFEFF中 ==', 'hans')).toBe('\uFEFF中')
    expect(cleanWikitext('[https://a.b \uFEFF标签]', 'hans')).toBe('\uFEFF标签')
    expect(cleanWikitext('\uFEFF{| x\n|}\n后', 'hans')).toBe('\uFEFF{| x |} 后')
  })
})

describe('numeric entity parts', () => {
  it('parses unsigned integers the way Rust does', () => {
    expect(parseUnsigned('20013', 10)).toBe(20013)
    expect(parseUnsigned('+7', 10)).toBe(7)
    expect(parseUnsigned('4E2D', 16)).toBe(20013)
    expect(parseUnsigned('', 10)).toBeNull()
    expect(parseUnsigned('1a', 10)).toBeNull()
    expect(parseUnsigned(' 1', 10)).toBeNull()
    expect(parseUnsigned('100000000', 16)).toBeNull()
  })

  it('maps code points to scalar values only', () => {
    expect(charFromCodepoint(0x4e2d)).toBe('中')
    expect(charFromCodepoint(0xd800)).toBeNull()
    expect(charFromCodepoint(0x110000)).toBeNull()
    expect(charFromCodepoint(null)).toBeNull()
  })
})
