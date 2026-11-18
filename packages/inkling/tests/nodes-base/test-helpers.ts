// Shared HTML-rendering helpers for the nodes-base suites. The `html` tag
// PRETTIFIES (parser 'html') — a deliberate policy for these snapshots.
import { createTestDom } from '@kobato/inkling/tests/utils/render-live'
import Prettier from '@prettier/sync'
import { minify } from 'html-minifier-terser'
import assert from 'node:assert/strict'

const minifyOpts = { collapseWhitespace: true, collapseInlineTagWhitespace: true }

export function html(partials: TemplateStringsArray, ...params: unknown[]) {
  let output = ''
  for (let i = 0; i < partials.length; i++) {
    output += partials[i]
    if (i < partials.length - 1) {
      output += params[i] as string
    }
  }

  return Prettier.format(output, { parser: 'html' })
}

export const dom = createTestDom()

const parser = new dom.window.DOMParser()
export function createDocument(htmlString: string) {
  return parser.parseFromString(htmlString, 'text/html')
}

// Minifies and prettifies both sides, then asserts string equality.
export async function expectPrettifiedHtml(actual: string, expected: string): Promise<void> {
  const expectedFormatted = Prettier.format(await minify(expected, minifyOpts), { parser: 'html' })

  assert.equal(typeof actual, 'string', 'expected a string')
  const result = Prettier.format(await minify(actual, minifyOpts), { parser: 'html' })
  assert.equal(result, expectedFormatted)
}
