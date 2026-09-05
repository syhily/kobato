import { createTestDom } from '#/utils/render-live'
import { htmlToLexical as importWithDom, type htmlToLexicalOptions } from '@/html/html-to-lexical/index'

// Shared call adapter for the importer's injected-DOM signature: one
// jsdom-backed dom is collected here instead of every test constructing its
// own. Parsing itself creates a fresh document per call, so the shared
// instance carries no cross-test state.
const dom = createTestDom()

export function htmlToLexical(html: string, options?: Omit<htmlToLexicalOptions, 'dom'>) {
  return importWithDom(html, { ...options, dom })
}
