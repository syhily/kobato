// @vitest-environment happy-dom

import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type { ElementNode, LexicalNode } from 'lexical'

import { createBodyEditorConfig } from '@kobato/shared/lexical/body-config'
import { $isFootnoteDefinitionNode } from '@kobato/shared/lexical/nodes/footnote-definition-node'
import { $isFootnoteRefNode } from '@kobato/shared/lexical/nodes/footnote-ref-node'
import { $isHorizontalRuleNode } from '@kobato/shared/lexical/nodes/horizontal-rule-node'
import { $isImageNode } from '@kobato/shared/lexical/nodes/image-node'
import { $isInlineMathNode } from '@kobato/shared/lexical/nodes/inline-math-node'
import { $isMathBlockNode } from '@kobato/shared/lexical/nodes/math-block-node'
import { $isMusicPlayerNode } from '@kobato/shared/lexical/nodes/music-player-node'
import { $isSolutionNode } from '@kobato/shared/lexical/nodes/solution-node'
import { $isTwoColumnNode } from '@kobato/shared/lexical/nodes/two-column-node'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { createHeadlessEditor } from '@lexical/headless'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $isElementNode } from 'lexical'
import { describe, expect, it } from 'vitest'

// DOM contract tests for the custom body nodes (R3a): `exportDOM` must
// emit the render-manifest markup (`@kobato/shared/lexical/html-manifest`)
// plus the
// `data-*` round-trip attributes, and `importDOM` must parse that same
// markup back into the identical node fields — copy/paste and HTML
// export stay isomorphic with the public render.

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []): Record<string, unknown> {
  return { ...elementBase(), type: 'paragraph', children, textFormat: 0, textStyle: '' }
}

function text(text: string): Record<string, unknown> {
  return { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function body(children: unknown[] = []): LexicalBody {
  return unsafeCast<LexicalBody>({ root: { ...elementBase(), type: 'root', children } })
}

function htmlFor(input: LexicalBody): string {
  const editor = createHeadlessEditor(createBodyEditorConfig())
  editor.setEditorState(editor.parseEditorState(JSON.stringify(input)))
  // `editor.read` (not the legacy `getEditorState().read`) sets the
  // active-editor scope that text-node exportDOM requires.
  return editor.read(() => $generateHtmlFromNodes(editor))
}

function importFromHtml<T>(html: string, inspect: (nodes: LexicalNode[]) => T): T {
  const editor = createHeadlessEditor(createBodyEditorConfig())
  const container = document.createElement('div')
  container.innerHTML = html
  let result: T | undefined
  editor.update(() => {
    result = inspect($generateNodesFromDOM(editor, container))
  })
  // Inspected values are extracted inside the update callback, so the
  // assertions below run on plain data, outside any editor scope.
  return result as T
}

describe('shared/lexical/nodes — exportDOM contract', () => {
  it('inline math exports the manifest span form with round-trip data', () => {
    const html = htmlFor(
      body([
        paragraph([{ type: 'mathInline', version: 1, tex: 'a^2', mathml: '<math><mi>a</mi></math>', ptKey: 'm1' }]),
      ]),
    )
    expect(html).toContain('data-math-inline')
    expect(html).toContain('class="math-inline inline-block align-middle"')
    expect(html).toContain('data-tex="a^2"')
    expect(html).toContain('<math><mi>a</mi></math>')
    expect(html).toContain('data-pt-key="m1"')
  })

  it('inline math falls back to an escaped TeX code element', () => {
    const html = htmlFor(body([paragraph([{ type: 'mathInline', version: 1, tex: 'a<b' }])]))
    // DOM attribute serialization does NOT escape `<` (only `&`/quotes);
    // the code element body is escaped text.
    expect(html).toContain('data-tex="a<b"')
    expect(html).toContain('<code>a&lt;b</code>')
  })

  it('footnote refs export the manifest sup>a form with round-trip data', () => {
    const html = htmlFor(
      body([paragraph([{ type: 'footnoteRef', version: 1, targetKey: 'def-1', index: 2, ptKey: 'fr1' }])]),
    )
    expect(html).toContain('<sup id="user-content-fnref-2" data-footnote-ref=""')
    expect(html).toContain('data-footnote-target-key="def-1"')
    expect(html).toContain('data-footnote-index="2"')
    expect(html).toContain('<a href="#user-content-fn-2" class="footnote-ref">2</a>')
  })

  it('images export the manifest figure form with round-trip data', () => {
    const html = htmlFor(
      body([
        {
          type: 'image',
          version: 1,
          src: '/img.png',
          alt: '图',
          caption: '说明',
          layout: 'right',
          width: 100,
          height: 50,
          thumbhash: 'th',
          storagePath: 'storage/1',
          imageId: 'img-1',
          ptKey: 'imgk',
        },
      ]),
    )
    expect(html).toContain('<figure data-pt-image="" class="block max-w-full mr-0 ml-auto w-fit"')
    expect(html).toContain('data-layout="right"')
    expect(html).toContain('data-storage-path="storage/1"')
    expect(html).toContain('data-image-id="img-1"')
    expect(html).toContain(
      '<img src="/img.png" alt="图" width="100" height="50" data-thumbhash="th" loading="lazy" decoding="async"',
    )
    expect(html).toContain('<figcaption>说明</figcaption>')
  })

  it('block math exports the manifest display form', () => {
    const html = htmlFor(
      body([{ type: 'mathBlock', version: 1, tex: 'x=1', mathml: '<math><mi>x</mi></math>', ptKey: 'mb1' }]),
    )
    expect(html).toContain('<div data-pt-math-block="" class="math math-display')
    expect(html).toContain('data-tex="x=1"')
    expect(html).toContain('<math><mi>x</mi></math>')
  })

  it('music players export the missing-meta placeholder form with round-trip data', () => {
    const html = htmlFor(
      body([{ type: 'musicPlayer', version: 1, playerId: 'abcd1234abcd1234', auto: true, ptKey: 'mp1' }]),
    )
    expect(html).toContain('<p data-pt-music-player="abcd1234abcd1234" data-auto="true"')
    expect(html).toContain('🎵 此文章包含音乐播放器，请访问原文收听。')
  })

  it('solution exports the decorated blockquote form', () => {
    const html = htmlFor(
      body([
        {
          ...elementBase(),
          type: 'solution',
          ptKey: 's1',
          children: [paragraph([text('解在这里')])],
        },
      ]),
    )
    expect(html).toContain('<blockquote data-pt-solution="" class="solution')
    expect(html).toContain('data-pt-solution-begin=""')
    expect(html).toContain('解：')
    expect(html).toContain('data-pt-solution-qed=""')
    expect(html).toContain('>解在这里<')
  })

  it('twoColumn exports the section + two pane form', () => {
    const html = htmlFor(
      body([
        {
          ...elementBase(),
          type: 'twoColumn',
          ptKey: 'tc1',
          children: [
            { ...elementBase(), type: 'twoColumnPane', side: 'left', children: [paragraph([text('左')])] },
            { ...elementBase(), type: 'twoColumnPane', side: 'right', children: [paragraph([text('右')])] },
          ],
        },
      ]),
    )
    expect(html).toContain('<section data-pt-two-column="" class="my-6 grid')
    expect(html).toContain('<div data-pt-two-column-pane="" data-side="left" class="min-w-0">')
    expect(html).toContain('<div data-pt-two-column-pane="" data-side="right" class="min-w-0">')
    expect(html).toContain('>左<')
    expect(html).toContain('>右<')
  })

  it('footnote definitions export a data-annotated container', () => {
    const html = htmlFor(
      body([
        {
          ...elementBase(),
          type: 'footnoteDefinition',
          index: 1,
          ptKey: 'def-1',
          children: [paragraph([text('脚注')])],
        },
      ]),
    )
    expect(html).toContain('<div data-pt-footnote-definition="" data-footnote-index="1"')
    expect(html).toContain('>脚注<')
  })

  it('horizontal rules export an hr element', () => {
    const html = htmlFor(body([{ type: 'horizontalrule', version: 1 }]))
    expect(html).toMatch(/<hr(?:\s*\/)?>/)
  })
})

describe('shared/lexical/nodes — importDOM round-trip', () => {
  it('inline math round-trips tex + mathml', () => {
    const snap = importFromHtml(
      '<p><span data-math-inline="" class="math-inline inline-block align-middle" data-tex="a^2" data-pt-key="m1"><math><mi>a</mi></math></span></p>',
      (nodes) => {
        const first = nodes[0]
        if (first === undefined || !$isElementNode(first)) {
          throw new Error('expected paragraph')
        }
        const node = first.getChildren()[0]
        if (!$isInlineMathNode(node)) {
          throw new Error('expected InlineMathNode')
        }
        return { tex: node.getTex(), mathml: node.getMathml(), ptKey: node.getPtKey() }
      },
    )
    expect(snap.tex).toBe('a^2')
    expect(snap.mathml).toContain('<mi>a</mi>')
    expect(snap.ptKey).toBe('m1')
  })

  it('footnote refs round-trip targetKey + index', () => {
    const snap = importFromHtml(
      '<p><sup id="user-content-fnref-3" data-footnote-ref="" data-footnote-target-key="def-2" data-footnote-index="3"><a href="#user-content-fn-3">3</a></sup></p>',
      (nodes) => {
        const first = nodes[0]
        if (first === undefined || !$isElementNode(first)) {
          throw new Error('expected paragraph')
        }
        const node = first.getChildren()[0]
        if (!$isFootnoteRefNode(node)) {
          throw new Error('expected FootnoteRefNode')
        }
        return { targetKey: node.getTargetKey(), index: node.getIndex() }
      },
    )
    expect(snap.targetKey).toBe('def-2')
    expect(snap.index).toBe(3)
  })

  it('images round-trip all fields', () => {
    const snap = importFromHtml(
      '<figure data-pt-image="" class="block max-w-full" data-layout="left" data-storage-path="storage/1" data-image-id="img-1" data-pt-key="imgk"><img src="/img.png" alt="图" width="100" height="50" data-thumbhash="th"/><figcaption>说明</figcaption></figure>',
      (nodes) => {
        const node = nodes[0]
        if (!$isImageNode(node)) {
          throw new Error('expected ImageNode')
        }
        return {
          src: node.getSrc(),
          alt: node.getAlt(),
          caption: node.getCaption(),
          layout: node.getLayout(),
          width: node.getWidth(),
          height: node.getHeight(),
          thumbhash: node.getThumbhash(),
          storagePath: node.getStoragePath(),
          imageId: node.getImageId(),
          ptKey: node.getPtKey(),
        }
      },
    )
    expect(snap).toEqual({
      src: '/img.png',
      alt: '图',
      caption: '说明',
      layout: 'left',
      width: 100,
      height: 50,
      thumbhash: 'th',
      storagePath: 'storage/1',
      imageId: 'img-1',
      ptKey: 'imgk',
    })
  })

  it('block math round-trips tex + mathml', () => {
    const snap = importFromHtml(
      '<div data-pt-math-block="" class="math math-display" data-tex="x=1"><math><mi>x</mi></math></div>',
      (nodes) => {
        const node = nodes[0]
        if (!$isMathBlockNode(node)) {
          throw new Error('expected MathBlockNode')
        }
        return { tex: node.getTex(), mathml: node.getMathml() }
      },
    )
    expect(snap.tex).toBe('x=1')
    expect(snap.mathml).toContain('<mi>x</mi>')
  })

  it('music players round-trip playerId + flags', () => {
    const snap = importFromHtml(
      '<p data-pt-music-player="abcd1234abcd1234" data-auto="true" data-center="false">🎵 此文章包含音乐播放器，请访问原文收听。</p>',
      (nodes) => {
        const node = nodes[0]
        if (!$isMusicPlayerNode(node)) {
          throw new Error('expected MusicPlayerNode')
        }
        return { playerId: node.getPlayerId(), auto: node.getAuto(), center: node.getCenter() }
      },
    )
    expect(snap.playerId).toBe('abcd1234abcd1234')
    expect(snap.auto).toBe(true)
    expect(snap.center).toBe(false)
  })

  it('solution round-trips children and strips the render decorations', () => {
    const snap = importFromHtml(
      '<blockquote data-pt-solution="" data-pt-key="s1"><div data-pt-solution-begin="">解：</div><p>内容</p><span data-pt-solution-qed="" aria-hidden="true"><svg viewBox="0 0 14 14"></svg></span></blockquote>',
      (nodes) => {
        const node = nodes[0]
        if (!$isSolutionNode(node)) {
          throw new Error('expected SolutionNode')
        }
        const element = unsafeCast<ElementNode>(node)
        return {
          ptKey: node.getPtKey(),
          childCount: element.getChildren().length,
          text: node.getTextContent(),
        }
      },
    )
    expect(snap.ptKey).toBe('s1')
    // Only the real children survive — no "解：" text, no QED leftovers.
    expect(snap.childCount).toBe(1)
    expect(snap.text).toBe('内容')
  })

  it('twoColumn round-trips its two panes', () => {
    const snap = importFromHtml(
      '<section data-pt-two-column="" data-pt-key="tc1"><div data-pt-two-column-pane="" data-side="left"><p>左</p></div><div data-pt-two-column-pane="" data-side="right"><p>右</p></div></section>',
      (nodes) => {
        const node = nodes[0]
        if (!$isTwoColumnNode(node)) {
          throw new Error('expected TwoColumnNode')
        }
        const panes = unsafeCast<ElementNode>(node).getChildren()
        return {
          ptKey: node.getPtKey(),
          paneCount: panes.length,
          leftText: panes[0]?.getTextContent(),
          rightText: panes[1]?.getTextContent(),
        }
      },
    )
    expect(snap.ptKey).toBe('tc1')
    expect(snap.paneCount).toBe(2)
    expect(snap.leftText).toBe('左')
    expect(snap.rightText).toBe('右')
  })

  it('footnote definitions round-trip index', () => {
    const snap = importFromHtml(
      '<div data-pt-footnote-definition="" data-footnote-index="2" data-pt-key="def-2"><p>脚注内容</p></div>',
      (nodes) => {
        const node = nodes[0]
        if (!$isFootnoteDefinitionNode(node)) {
          throw new Error('expected FootnoteDefinitionNode')
        }
        return { index: node.getIndex(), text: node.getTextContent() }
      },
    )
    expect(snap.index).toBe(2)
    expect(snap.text).toBe('脚注内容')
  })

  it('horizontal rules round-trip through hr', () => {
    const snap = importFromHtml('<hr>', (nodes) => nodes.length === 1 && $isHorizontalRuleNode(nodes[0]))
    expect(snap).toBe(true)
  })
})
