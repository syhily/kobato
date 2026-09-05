import { htmlToLexicalState, lexicalStateToHtml, lexicalStateToPlainText } from '@/html/headless-html'
import { MINIMAL_DOCUMENT } from '@/utils/initial-document'

// Public headless HTML surface, exercised through the
// barrel-facing functions with no dom passed — the vitest jsdom globals feed
// the port's global leg. Option semantics are pinned by reference in the
// characterization suites: renderer additive override in
// test/html-renderer/default-round-trip.test.ts, importer wholesale
// editorConfig replacement in test/html-to-lexical/.

const HEADING_STATE = `{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Hello","type":"extended-text","version":1}],"direction":"ltr","format":"","indent":0,"tag":"h1","type":"extended-heading","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}`

describe('htmlToLexicalState', () => {
  it('imports a heading as an extended-heading node', async () => {
    const state = await htmlToLexicalState('<h1>Hello</h1>')

    expect(state.root.children[0].type).toBe('extended-heading')
  })

  it('imports empty html as the minimal document', async () => {
    await expect(htmlToLexicalState('')).resolves.toEqual(MINIMAL_DOCUMENT)
  })

  it('strips imported text-align by default', async () => {
    const state = await htmlToLexicalState('<p style="text-align: center">Hello</p>')

    expect(state.root.children[0]).toMatchObject({ format: '' })
  })

  it("preserves imported text-align with alignment: 'keep'", async () => {
    const state = await htmlToLexicalState('<p style="text-align: center">Hello</p>', { alignment: 'keep' })

    expect(state.root.children[0]).toMatchObject({ format: 'center' })
  })
})

describe('lexicalStateToHtml', () => {
  it('renders the pinned heading string byte-exactly', async () => {
    const state = await htmlToLexicalState('<h1>Hello</h1>')

    await expect(lexicalStateToHtml(state)).resolves.toBe('<h1 id="hello">Hello</h1>')
  })

  it('is stable in both directions (state → HTML → state → HTML)', async () => {
    const html = await lexicalStateToHtml(HEADING_STATE)
    const state = await htmlToLexicalState(html)

    await expect(lexicalStateToHtml(state)).resolves.toBe(html)
  })
})

describe('lexicalStateToPlainText', () => {
  it('joins blocks with line breaks and drops the trailing empty paragraph', () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: 'First', type: 'text', version: 1 }],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'paragraph',
            version: 1,
          },
          {
            children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: 'Second', type: 'text', version: 1 }],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'paragraph',
            version: 1,
          },
          { children: [], direction: null, format: '', indent: 0, type: 'paragraph', version: 1 },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    expect(lexicalStateToPlainText(state)).toBe('First\n\nSecond')
  })

  it('removes in-progress at-link search nodes like the headless render path', () => {
    const state = `{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Testing Before ","type":"text","version":1},{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"","type":"zwnj","version":1},{"detail":0,"format":0,"mode":"normal","style":"","text":"search","type":"at-link-search","version":1,"placeholder":null}],"direction":"ltr","format":"","indent":0,"type":"at-link","version":1,"linkFormat":0},{"detail":0,"format":0,"mode":"normal","style":"","text":" After","type":"text","version":1}],"direction":"ltr","format":"","indent":0,"type":"paragraph","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}`

    expect(lexicalStateToPlainText(state)).toBe('Testing Before After')
  })
})
