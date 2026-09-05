import shouldRender from '#/html-renderer/utils/should-render'
import { AsideNode, ExtendedQuoteNode } from '@/nodes/base'

describe('Quotes', function () {
  it(
    'quote',
    shouldRender({
      input: `{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Blockquote with ","type":"text","version":1},{"detail":0,"format":1,"mode":"normal","style":"","text":"formatting","type":"text","version":1}],"direction":"ltr","format":"","indent":0,"type":"quote","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}`,
      output: `<blockquote>Blockquote with <strong>formatting</strong></blockquote>`,
    }),
  )

  it(
    'extended-quote',
    shouldRender({
      options: { nodes: [ExtendedQuoteNode] },
      input: `{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Blockquote with ","type":"text","version":1},{"detail":0,"format":1,"mode":"normal","style":"","text":"formatting","type":"text","version":1}],"direction":"ltr","format":"","indent":0,"type":"extended-quote","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}`,
      output: `<blockquote>Blockquote with <strong>formatting</strong></blockquote>`,
    }),
  )

  it(
    'big quote',
    shouldRender({
      options: { nodes: [AsideNode] },
      input: `{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Aside with ","type":"text","version":1},{"detail":0,"format":1,"mode":"normal","style":"","text":"formatting","type":"text","version":1}],"direction":"ltr","format":"","indent":0,"type":"aside","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}`,
      output: `<blockquote class="inkling-blockquote-alt">Aside with <strong>formatting</strong></blockquote>`,
    }),
  )
})
