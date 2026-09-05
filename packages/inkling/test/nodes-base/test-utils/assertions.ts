import Prettier from '@prettier/sync'
import { minify } from 'html-minifier-terser'
import assert from 'node:assert/strict'

const minifyOpts = { collapseWhitespace: true, collapseInlineTagWhitespace: true }

// Replaces the old `should.prettifyTo` custom assertion: minifies and
// prettifies both sides, then asserts string equality.
export async function expectPrettifiedHtml(actual: string, expected: string): Promise<void> {
  const expectedFormatted = Prettier.format(await minify(expected, minifyOpts), { parser: 'html' })

  assert.equal(typeof actual, 'string', 'expected a string')
  const result = Prettier.format(await minify(actual, minifyOpts), { parser: 'html' })
  assert.equal(result, expectedFormatted)
}
