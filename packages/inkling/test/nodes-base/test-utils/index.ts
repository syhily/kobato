import Prettier from '@prettier/sync'

// The html tag here PRETTIFIES (parser 'html') — deliberately unlike the raw
// concatenation tag in test/utils/e2e.ts: the two normalizers are different
// policies, keep them separate.
import { createTestDom } from '#/utils/render-live'

export function html(partials: TemplateStringsArray, ...params: unknown[]) {
  let output = ''
  for (let i = 0; i < partials.length; i++) {
    output += partials[i]
    if (i < partials.length - 1) {
      output += params[i]
    }
  }

  return Prettier.format(output, { parser: 'html' })
}

export const dom = createTestDom()

const parser = new dom.window.DOMParser()
export function createDocument(htmlString: string) {
  return parser.parseFromString(htmlString, 'text/html')
}
