import { lexicalStateToHtml, type LexicalStateToHtmlOptions } from '@kobato/inkling-internal/html/headless-html'
import { createTestDom } from '@kobato/inkling/tests/utils/render-live'
import { expect } from 'vitest'

const dom = createTestDom()

interface ShouldRenderParams {
  input: string
  output: string
  options?: LexicalStateToHtmlOptions
}

function shouldRender({ input, output, options = {} }: ShouldRenderParams) {
  return async function () {
    const defaultOnError = (err: Error) => {
      throw err
    }

    const { nodes, onError, ...renderOptions } = options
    const renderedInput = await lexicalStateToHtml(input, {
      dom,
      nodes,
      onError: onError || defaultOnError,
      ...renderOptions,
    })
    expect(renderedInput).toBe(output)
  }
}

export default shouldRender
