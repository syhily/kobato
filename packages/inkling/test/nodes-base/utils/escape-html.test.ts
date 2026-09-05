import { escapeHtml } from '@/nodes/base/utils/escape-html'

describe('Utils: escapeHtml', function () {
  it('escapes special HTML characters', function () {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml("'")).toBe('&#039;')
  })

  it('escapes a string with multiple special characters', function () {
    expect(escapeHtml('<div class="test">It\'s & </div>')).toBe(
      '&lt;div class=&quot;test&quot;&gt;It&#039;s &amp; &lt;/div&gt;',
    )
  })

  it('returns an empty string for empty input', function () {
    expect(escapeHtml('')).toBe('')
  })
})
