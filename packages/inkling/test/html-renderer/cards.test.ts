import Prettier from 'prettier'

import { createTestDom } from '#/utils/render-live'
import { lexicalStateToHtml } from '@/html/headless-html'
import { BaseImageNode, BaseHtmlNode } from '@/nodes/base'

const nodes = [BaseImageNode, BaseHtmlNode]

interface TestLexicalState {
  root: {
    children: Array<Record<string, unknown>>
    direction: string | null
    format: string
    indent: number
    type: string
    version: number
  }
}

describe('Cards', function () {
  let lexicalState: TestLexicalState
  let options: Record<string, unknown>

  beforeEach(function () {
    lexicalState = {
      root: {
        children: [],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    options = {
      imageOptimization: {
        contentImageSizes: {
          w600: { width: 600 },
          w1000: { width: 1000 },
          w1600: { width: 1600 },
          w2400: { width: 2400 },
        },
      },
      createDocument() {
        return createTestDom().window.document
      },
    }
  })

  it('renders an image card', async function () {
    const imageCard = {
      type: 'image',
      src: '/content/images/2022/11/inkling-lexical.jpg',
      caption: 'This is a caption',
      cardWidth: 'regular',
    }
    lexicalState.root.children.push(imageCard)

    const renderedInput = await lexicalStateToHtml(JSON.stringify(lexicalState), { nodes, ...options })

    const output = await Prettier.format(renderedInput, { parser: 'html' })

    const expected = `<figure class="inkling-card inkling-image-card inkling-card-hascaption">
  <img
    src="/content/images/2022/11/inkling-lexical.jpg"
    class="inkling-image"
    alt=""
    loading="lazy"
  />
  <figcaption>This is a caption</figcaption>
</figure>
`
    expect(output).toBe(expected)
  })

  it('renders HTML card with unclosed tags', async function () {
    lexicalState.root.children.push(
      {
        type: 'html',
        html: '<div style="color: red">',
      },
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Testing this',
            type: 'text',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
      {
        type: 'html',
        html: '</div>',
      },
    )

    const renderedInput = await lexicalStateToHtml(JSON.stringify(lexicalState), { nodes, ...options })

    const expected = `
<!--inkling-card-begin: html-->
<div style="color: red">
<!--inkling-card-end: html-->
<p>Testing this</p>
<!--inkling-card-begin: html-->
</div>
<!--inkling-card-end: html-->
`
    expect(renderedInput).toBe(expected)
  })

  it('renders HTML card with html entities and single-quote attributes', async function () {
    lexicalState.root.children.push({
      type: 'html',
      html: '<p>&lt;pre&gt;Test&lt;/pre&gt;</p>\n<div data-graph-name=\'The "all-in" cost of a grant\'>Test</div>',
    })

    const renderedInput = await lexicalStateToHtml(JSON.stringify(lexicalState), { nodes, ...options })

    const expected = `
<!--inkling-card-begin: html-->
<p>&lt;pre&gt;Test&lt;/pre&gt;</p>
<div data-graph-name='The "all-in" cost of a grant'>Test</div>
<!--inkling-card-end: html-->
`
    expect(renderedInput).toBe(expected)
  })
})
