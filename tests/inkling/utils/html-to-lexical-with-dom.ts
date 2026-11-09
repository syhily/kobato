import { createTestDom } from '#/inkling/utils/render-live'
import { htmlToLexical as importWithDom, type htmlToLexicalOptions } from '@/inkling/html/html-to-lexical/index'

// Shared call adapter for the importer's injected-DOM signature: one
// jsdom-backed dom is collected here instead of every test constructing its
// own. Parsing itself creates a fresh document per call, so the shared
// instance carries no cross-test state.
const dom = createTestDom()

export function htmlToLexical(html: string, options?: Omit<htmlToLexicalOptions, 'dom'>) {
  const state = importWithDom(html, { ...options, dom })
  // Normalize through the persisted form: Lexical 0.51+ schema-driven export
  // leaves undefined-valued keys on the plain object (e.g. root textFormat),
  // which JSON.stringify drops — the strict deep-equal fixtures compare
  // against the persisted shape.
  return JSON.parse(JSON.stringify(state)) as ReturnType<typeof importWithDom>
}
