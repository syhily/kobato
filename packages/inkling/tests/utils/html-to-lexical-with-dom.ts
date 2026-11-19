import {
  htmlToLexical as importWithDom,
  type htmlToLexicalOptions,
} from '@kobato/inkling-internal/html/html-to-lexical/index'
import { createTestDom } from '@kobato/inkling/tests/utils/render-live'

const dom = createTestDom()

export function htmlToLexical(html: string, options?: Omit<htmlToLexicalOptions, 'dom'>) {
  const state = importWithDom(html, { ...options, dom })
  return JSON.parse(JSON.stringify(state)) as ReturnType<typeof importWithDom>
}
