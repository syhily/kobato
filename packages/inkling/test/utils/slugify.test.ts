import slugify, { slugify as namedSlugify } from '@/utils/slugify'

describe('slugify()', function () {
  it('handles empty input', function () {
    expect(slugify(null)).toEqual('')
    expect(slugify(undefined)).toEqual('')
    expect(slugify('')).toEqual('')
    // non-string input is a compile error, not a runtime case — the old
    // `unknown` signature only existed to tolerate it
    // @ts-expect-error the narrowed signature rejects non-strings
    expect(slugify({})).toEqual('')
  })

  describe('<4.x markdown', function () {
    it('replaces all whitespace with empty string', function () {
      expect(slugify('test one\ttwo', { inklingVersion: '2.0', type: 'markdown' })).toEqual('testonetwo')
    })

    it('uses the legacy slug for a 3.x patch version', function () {
      expect(slugify('test one\ttwo', { inklingVersion: '3.9.1', type: 'markdown' })).toEqual('testonetwo')
      expect(slugify('test one\ttwo', { inklingVersion: '3.9.1' })).toEqual('test-one-two')
    })

    it('replaces all "non-word" chars with empty string', function () {
      expect(slugify('tést øne twö', { inklingVersion: '2.0', type: 'markdown' })).toEqual('tstnetw')
    })

    it('lower cases everything', function () {
      expect(slugify('TÉST ÓNE TWÖ', { inklingVersion: '2.0', type: 'markdown' })).toEqual('tstnetw')
    })
  })

  describe('<4.x mobiledoc', function () {
    it('replaces all white space with "-"', function () {
      expect(slugify('test one\ttwo', { inklingVersion: '3.0' })).toEqual('test-one-two')
    })

    it('replaces all "non-word" chars with "-"', function () {
      expect(slugify('tést øne twö', { inklingVersion: '3.0' })).toEqual('t-st-ne-tw-')
    })

    it('collapses multiple "-"', function () {
      expect(slugify('ñéïñ', { inklingVersion: '3.0' })).toBe('-')
    })

    it('lower cases everything', function () {
      expect(slugify('TEST ONE\tTWO', { inklingVersion: '3.0' })).toEqual('test-one-two')
    })
  })

  describe('4.x', function () {
    it('replaces all white space with "-"', function () {
      expect(slugify('test one\t two')).toBe('test-one-two')
    })

    it('strips symbols', function () {
      expect(slugify('test! one? {two}')).toBe('test-one-two')
    })

    it('%-encodes chars', function () {
      const slug = slugify('ñéïñ')

      expect(slug).toBe('%C3%B1%C3%A9%C3%AF%C3%B1')
      expect(decodeURIComponent(slug)).toBe('ñéïñ')
    })

    it('removes leading/trailing "-" and collapses "-" groups', function () {
      expect(slugify(' \ttest    one  two! \t')).toBe('test-one-two')
    })

    it('matches the named export for header-like input', function () {
      const input = 'Some Header!'
      const fromDefault = slugify(input)
      const fromNamed = namedSlugify(input)

      expect(fromNamed).toBe(fromDefault)
      expect(fromNamed).toBe('some-header')
    })

    it('uses the 4.x slug for 4.x versions and unparseable versions', function () {
      for (const inklingVersion of ['4.0', '4.2.0', 'dev']) {
        expect(slugify('test one\t two', { inklingVersion })).toBe('test-one-two')
      }
    })
  })
})
