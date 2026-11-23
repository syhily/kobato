import { createTestDom } from '@kobato/inkling/tests/utils/render-live'
import { minify } from 'html-minifier-terser'
import assert from 'node:assert/strict'
import { format } from 'oxfmt'

const minifyOpts = { collapseWhitespace: true, collapseInlineTagWhitespace: true }

export const dom = createTestDom()

const parser = new dom.window.DOMParser()
export function createDocument(htmlString: string) {
  return parser.parseFromString(htmlString, 'text/html')
}

async function normalizeHtml(source: string): Promise<string> {
  const result = await format('fragment.html', await minify(source, minifyOpts))
  const parseErrors = result.errors.map((error) => error.message).join('\n')
  assert.equal(result.errors.length, 0, `oxfmt could not parse the HTML under comparison:\n${parseErrors}`)
  return result.code
}

export async function expectHtml(actual: string, expected: string): Promise<void> {
  const expectedNormalized = await normalizeHtml(expected)
  assert.equal(typeof actual, 'string', 'expected a string')
  const actualNormalized = await normalizeHtml(actual)
  assert.equal(actualNormalized, expectedNormalized)
}
